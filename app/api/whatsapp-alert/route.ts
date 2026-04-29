import { NextResponse } from 'next/server';
import { Product, StoreSettings } from '@/types';

export const dynamic = 'force-dynamic';

type AlertPayload = {
  settings?: Pick<StoreSettings,
    'whatsappAlertProvider' |
    'whatsappAlertApiUrl' |
    'whatsappAlertApiToken' |
    'whatsappAlertSender' |
    'whatsappAlertRecipient' |
    'whatsappAlertInstance'
  >;
  product?: Partial<Product> & { stock?: number; minStock?: number };
};

function trimSlash(value?: string) {
  return String(value || '').trim().replace(/\/$/, '');
}

function normalizeNumber(value?: string) {
  return String(value || '').replace(/\D/g, '');
}

function stockMessage(product: AlertPayload['product']) {
  const name = product?.name || 'Unknown product';
  const barcode = product?.barcode ? `\nBarcode: ${product.barcode}` : '';
  const unit = product?.unit ? ` ${product.unit}` : '';
  const stock = Number(product?.stock ?? 0);
  const minStock = Number(product?.minStock ?? 5);

  return [
    'NSB POS Low Stock Alert',
    '',
    `Product: ${name}`,
    `Current stock: ${stock}${unit}`,
    `Minimum stock: ${minStock}${unit}`,
    barcode.trim(),
  ].filter(Boolean).join('\n');
}

async function sendCustomGateway(settings: NonNullable<AlertPayload['settings']>, product: AlertPayload['product']) {
  const endpoint = trimSlash(settings.whatsappAlertApiUrl);
  return fetch(`${endpoint}/api/stock-low`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.whatsappAlertApiToken ? { Authorization: `Bearer ${settings.whatsappAlertApiToken}` } : {}),
    },
    body: JSON.stringify({
      to: settings.whatsappAlertRecipient || undefined,
      product,
    }),
  });
}

async function sendEvolution(settings: NonNullable<AlertPayload['settings']>, product: AlertPayload['product']) {
  const endpoint = trimSlash(settings.whatsappAlertApiUrl);
  const instance = String(settings.whatsappAlertInstance || '').trim();
  const recipient = normalizeNumber(settings.whatsappAlertRecipient);
  const sender = normalizeNumber(settings.whatsappAlertSender);

  if (!instance) throw new Error('Evolution API instance name is required');
  if (!recipient) throw new Error('Receiving WhatsApp number is required');
  if (sender && sender === recipient) throw new Error('Sending and receiving WhatsApp numbers must be different');

  return fetch(`${endpoint}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: settings.whatsappAlertApiToken || '',
    },
    body: JSON.stringify({
      number: recipient,
      textMessage: {
        text: stockMessage(product),
      },
    }),
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as AlertPayload;
    const settings = payload.settings;

    if (!settings?.whatsappAlertApiUrl) {
      return NextResponse.json({ ok: false, error: 'WhatsApp API URL is required' }, { status: 400 });
    }

    const provider = settings.whatsappAlertProvider || 'custom';
    const response = provider === 'evolution'
      ? await sendEvolution(settings, payload.product)
      : await sendCustomGateway(settings, payload.product);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json({ ok: false, error: errorText || response.statusText }, { status: response.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not send WhatsApp alert' },
      { status: 500 },
    );
  }
}
