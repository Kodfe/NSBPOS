import { Product, StoreSettings } from '@/types';

export async function sendLowStockAlert(product: Product, newStock: number, settings: StoreSettings) {
  if (!settings.whatsappAlertEnabled || !settings.whatsappAlertApiUrl) return;

  try {
    await fetch('/api/whatsapp-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          whatsappAlertProvider: settings.whatsappAlertProvider || 'custom',
          whatsappAlertApiUrl: settings.whatsappAlertApiUrl,
          whatsappAlertApiToken: settings.whatsappAlertApiToken,
          whatsappAlertSender: settings.whatsappAlertSender,
          whatsappAlertRecipient: settings.whatsappAlertRecipient,
          whatsappAlertInstance: settings.whatsappAlertInstance,
        },
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
