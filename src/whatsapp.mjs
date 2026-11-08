const waEncoder = new TextEncoder();
const waBytes = input => waEncoder.encode(input);
const waHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

function waKey(secret) {
  return crypto.subtle.importKey('raw', waBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function waPublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) return url.href;
  } catch { /* An absolute HTTPS base URL is required. */ }
  return null;
}

const webhookResponse = (body, status = 200) => new Response(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
});

function waInbound(data, phoneId) {
  const messages = [];
  if (data?.object !== 'whatsapp_business_account' || !Array.isArray(data.entry)) return messages;
  for (const entry of data.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value = change.value;
      if (change.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId || !Array.isArray(value.messages)) continue;
      for (const item of value.messages) {
        if (item?.type === 'text' && /^\d{7,16}$/.test(item.from) && typeof item.id === 'string' &&
          item.id.length >= 6 && item.id.length <= 256 && typeof item.text?.body === 'string') {
          messages.push({ id: item.id, from: item.from, text: item.text.body });
        }
      }
    }
  }
  return messages;
}

async function waSend(env, phoneId, version, recipient, body) {
  const response = await (env.WHATSAPP_FETCH || fetch)(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(8000), headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body, preview_url: false } })
  });
  if (!response.ok) throw new Error('WhatsApp delivery failed');
}

export async function handleWhatsApp(request, env, onMessage) {
  if (request.method === 'GET') {
    const query = new URL(request.url).searchParams;
    const challenge = query.get('hub.challenge');
    if (env.WHATSAPP_VERIFY_TOKEN && query.get('hub.mode') === 'subscribe' &&
      query.get('hub.verify_token') === env.WHATSAPP_VERIFY_TOKEN && /^\d{1,30}$/.test(challenge || '')) {
      return webhookResponse(challenge);
    }
    return webhookResponse('Verification failed', 403);
  }
  if (request.method !== 'POST') return webhookResponse('Method not allowed', 405);
  const appUrl = waPublicUrl(env.PUBLIC_APP_URL);
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  const version = env.WHATSAPP_GRAPH_VERSION;
  if (!env.DB || !env.WHATSAPP_APP_SECRET || !env.WHATSAPP_ACCESS_TOKEN ||
    !appUrl || !/^\d{6,24}$/.test(phoneId || '') || !/^v\d+\.\d+$/.test(version || '')) {
    return webhookResponse('WhatsApp is not configured', 503);
  }
  const signature = request.headers.get('X-Hub-Signature-256') || '';
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return webhookResponse('Invalid signature', 403);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 24000) return webhookResponse('Payload too large', 413);
  const key = await waKey(env.WHATSAPP_APP_SECRET);
  const signatureBytes = Uint8Array.from(signature.slice(7).match(/../g), part => parseInt(part, 16));
  if (!await crypto.subtle.verify('HMAC', key, signatureBytes, bytes)) return webhookResponse('Invalid signature', 403);
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return webhookResponse('Invalid JSON', 400); }
  const digest = async value => waHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, waBytes(value))));
  try {
    for (const item of waInbound(data, phoneId)) {
      const [sender, message] = await Promise.all([digest(`sender:${item.from}`), digest(`message:${item.id}`)]);
      await onMessage({ sender, message, text: item.text, appUrl }, reply => waSend(env, phoneId, version, item.from, reply));
    }
  } catch {
    return webhookResponse('Retry delivery', 503);
  }
  return webhookResponse('EVENT_RECEIVED');
}

const waPrompts = {
  type: ['What kind of business do you run?', 'आप किस तरह का कारोबार चलाते हैं?'],
  location: ['What is your city or six-digit PIN, and how many sites do you have?', 'आपका शहर या छह अंकों का PIN क्या है और कितने स्थान हैं?'],
  staff: ['How many people work in the business?', 'कारोबार में कितने लोग काम करते हैं?'],
  tools: ['What do you need? For example, CCTV, guest Wi-Fi, POS, or outage backup. Reply none if you only need internet.', 'आपको क्या चाहिए? जैसे CCTV, गेस्ट Wi-Fi, POS या बैकअप। केवल इंटरनेट के लिए “कुछ नहीं” लिखें।'],
  budget: ['What is your total monthly budget in rupees?', 'आपका कुल मासिक बजट रुपये में कितना है?'],
  gst: ['For this sandbox, enter your synthetic GSTIN or reply “no GSTIN”.', 'इस डेमो के लिए अपना सिंथेटिक GSTIN या “GSTIN नहीं” भेजें।']
};

export function waReply(state, next, appUrl, code) {
  const hi = state.language === 'hi';
  if (next) return waPrompts[next][Number(hi)];
  if (!code) return hi ? 'यह केस बंद है। नया संदेश भेजकर नया केस शुरू करें।' : 'This case is closed. Send a new message to start a new case.';
  const link = new URL(appUrl);
  link.hash = `resume=${state.id}.${code}`;
  const intro = state.quote?.route === 'self'
    ? (hi ? 'आपका कोट तैयार है।' : 'Your quote is ready.')
    : (hi ? 'अपना केस और अगला कदम देखें।' : 'Review your case and next step.');
  return `${intro}\n${link.href}\n${hi ? 'यह लिंक 10 मिनट में समाप्त हो जाएगा।' : 'This single-use link expires in 10 minutes.'}`;
}
