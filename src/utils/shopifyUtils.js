export function buildShopifyTrackingFromFulfillments(fulfillments = []) {
  const mapped = fulfillments.map(fulfillment => ({
    id: fulfillment.id,
    status: fulfillment.status,
    tracking_company: fulfillment.tracking_company,
    tracking_number: fulfillment.tracking_number,
    tracking_url: fulfillment.tracking_url,
    tracking_urls: fulfillment.tracking_urls || [],
    created_at: fulfillment.created_at,
    updated_at: fulfillment.updated_at,
    shipment_status: fulfillment.shipment_status,
    location_id: fulfillment.location_id,
    line_items: (fulfillment.line_items || []).map(li => ({ id: li.id, quantity: li.quantity }))
  }));

  const primary = fulfillments.length > 0 ? {
    tracking_number: fulfillments[0].tracking_number,
    tracking_url: fulfillments[0].tracking_url,
    tracking_company: fulfillments[0].tracking_company,
    status: fulfillments[0].status,
    shipment_status: fulfillments[0].shipment_status
  } : null;

  return { fulfillments: mapped, primary };
}


