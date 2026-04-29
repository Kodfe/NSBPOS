import { Product, StoreSettings } from '@/types';

export async function sendLowStockAlert(product: Product, newStock: number, settings: StoreSettings) {
  if (!settings.whatsappAlertEnabled || !settings.whatsappAlertApiUrl) return;

  try {
    const endpoint = settings.whatsappAlertApiUrl.replace(/\/$/, '');
    await fetch(`${endpoint}/api/stock-low`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.whatsappAlertApiToken ? { Authorization: `Bearer ${settings.whatsappAlertApiToken}` } : {}),
      },
      body: JSON.stringify({
        to: settings.whatsappAlertRecipient || undefined,
        product: {
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          unit: product.unit,
          stock: newStock,
          minStock: product.minStock ?? 5,
        },
      }),
    });
  } catch {
    // Alerts are best-effort so billing never fails because WhatsApp is offline.
  }
}
