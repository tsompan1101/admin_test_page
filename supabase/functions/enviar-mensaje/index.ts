// supabase functions deploy enviar-mensaje
// supabase secrets set SENDGRID_API_KEY=... EMAIL_FROM=... EMAIL_FROM_NAME="CIET 2026" \
//   TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... ALLOWED_ORIGIN=https://admin.tudominio.mx
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_DESTINATARIOS = 500
const PARALELO = 5

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function correo(to: string, subject: string, body: string) {
  if (!to.includes('@')) throw new Error('correo inválido')
  const email = Deno.env.get('EMAIL_FROM')!
  const name = Deno.env.get('EMAIL_FROM_NAME')
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }], // un correo por destinatario
      from: name ? { email, name } : { email },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  })
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
}

async function sms(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: Deno.env.get('TWILIO_FROM')!, Body: body }),
  })
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
}

// Ejecuta fn sobre cada destinatario con concurrencia limitada y junta los fallos.
async function enPool(items: string[], fn: (to: string) => Promise<void>) {
  const fallidos: { to: string; error: string }[] = []
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const to = items[i++]
      try {
        await fn(to)
      } catch (e) {
        fallidos.push({ to, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALELO, items.length) }, worker))
  return fallidos
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json('Método no permitido', 405)

  // Cliente con el JWT de quien llama: así RLS también aplica a la bitácora.
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return json('No autenticado', 401)
  const meta = user.app_metadata ?? {}
  const permitido = meta.role === 'admin' || ((meta.permisos as string[] | undefined) ?? []).includes('mensajes')
  if (!permitido) return json('No autorizado', 403)

  let p: { canal?: string; to?: string[]; subject?: string; body?: string }
  try {
    p = await req.json()
  } catch {
    return json('JSON inválido', 400)
  }

  const canal = p.canal
  if (canal !== 'email' && canal !== 'sms') return json("'canal' debe ser email o sms", 400)
  const body = (p.body ?? '').trim()
  const subject = (p.subject ?? '').trim()
  if (!body) return json("'body' no puede estar vacío", 400)
  if (canal === 'email' && !subject) return json("'subject' no puede estar vacío", 400)

  const faltan =
    canal === 'email'
      ? ['SENDGRID_API_KEY', 'EMAIL_FROM']
      : ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']
  const sinConfigurar = faltan.filter((v) => !Deno.env.get(v))
  if (sinConfigurar.length) return json(`Canal sin configurar; faltan: ${sinConfigurar.join(', ')}`, 503)

  const to = [...new Set((p.to ?? []).map((t) => String(t).trim()).filter(Boolean))]
  if (!to.length) return json('Sin destinatarios', 400)
  if (to.length > MAX_DESTINATARIOS) return json(`Máximo ${MAX_DESTINATARIOS} destinatarios`, 400)

  const fallidos = await enPool(to, (dest) => (canal === 'email' ? correo(dest, subject, body) : sms(dest, body)))
  const resultado = { total: to.length, enviados: to.length - fallidos.length, fallidos }

  await supa.from('mensajes_enviados').insert({
    canal,
    asunto: canal === 'email' ? subject : null,
    cuerpo: body,
    ...resultado,
    usuario: user.id,
  })

  // Siempre 200: el cliente revisa `fallidos` (invoke() trata 207/502 como error).
  return json(resultado)
})
