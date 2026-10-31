/**
 * What every courier integration provides. Today all couriers use the manual adapter: staff
 * book the parcel on the courier's portal and type the tracking number here. Phase 7 adds API
 * adapters (PostEx, Trax, Leopards) that book and track automatically behind this interface.
 */
export interface CourierAdapter {
  /** Public tracking page for a parcel, or null when the courier has none configured. */
  trackingUrl(trackingNumber: string): string | null;
}

export type CourierRecord = { code: string; trackingUrlTemplate: string | null };

class ManualCourier implements CourierAdapter {
  constructor(private readonly template: string | null) {}

  trackingUrl(trackingNumber: string) {
    return this.template ? this.template.replace('{tracking}', encodeURIComponent(trackingNumber)) : null;
  }
}

export function courierAdapter(courier: CourierRecord): CourierAdapter {
  return new ManualCourier(courier.trackingUrlTemplate);
}
