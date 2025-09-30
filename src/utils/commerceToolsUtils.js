import axios from 'axios';
import { getCacheKey, getCachedConfiguration } from './cacheUtils.js';

// Cache for Commerce Tools tokens
const commerceToolsTokenCache = new Map();

// Get Commerce Tools authentication token
export async function getCommerceToolsToken(credentials) {
  const cacheKey = credentials.chatbot_id;
  const cached = commerceToolsTokenCache.get(cacheKey);

  // Check if we have a valid cached token
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  try {
    const authHeader = Buffer.from(`${credentials.tracking_client_id}:${credentials.tracking_client_secret}`).toString('base64');

    const response = await axios.post(credentials.tracking_auth_url,
      new URLSearchParams({
        grant_type: credentials.tracking_auth_grant_type,
        scope: credentials.tracking_auth_scope
      }),
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const token = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600; // Default to 1 hour

    // Cache the token with expiration
    commerceToolsTokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000 // Expire 1 minute early
    });

    return token;
  } catch (error) {
    console.error('Error getting Commerce Tools token:', error.response?.data || error.message);
    throw error;
  }
}

// Fetch order from Commerce Tools
export async function fetchCommerceToolsOrder(credentials, orderNumber, email) {
  try {
    const token = await getCommerceToolsToken(credentials);

    // Build the query URL
    let orderUrl = `${credentials.tracking_base_url}/orders?where=orderNumber="${orderNumber}" and shippingAddress(email="${email}")`;

    console.log(`🔍 COMMERCE TOOLS: Fetching order with URL: ${orderUrl}`);

    let response = await axios.get(orderUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let responseData = response.data;
    console.log("🔍 COMMERCE TOOLS: Initial API response:", JSON.stringify(responseData, null, 2));

    // If no results found, try with different email case variations
    if (responseData.count === 0 && responseData.total === 0 && email) {
      console.log("🔍 EMAIL RETRY: No results found, trying case variations for email:", email);

      const originalEmail = email;
      const emailVariations = [
        originalEmail.toLowerCase(),
        originalEmail.toUpperCase(),
        originalEmail.charAt(0).toUpperCase() + originalEmail.slice(1).toLowerCase()
      ].filter(emailVar => emailVar !== originalEmail);

      for (const emailVariation of emailVariations) {
        console.log(`🔍 EMAIL RETRY: Trying email variation: "${emailVariation}"`);

        const retryUrl = `${credentials.tracking_base_url}/orders?where=orderNumber="${orderNumber}" and shippingAddress(email="${emailVariation}")`;

        try {
          const retryResponse = await axios.get(retryUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          console.log(`🔍 EMAIL RETRY: Response for "${emailVariation}":`, JSON.stringify(retryResponse.data, null, 2));

          if (retryResponse.data.count > 0 || retryResponse.data.total > 0) {
            console.log(`✅ EMAIL RETRY: Found results with email variation: "${emailVariation}"`);
            responseData = retryResponse.data;
            break;
          }
        } catch (retryError) {
          console.log(`❌ EMAIL RETRY: Failed for "${emailVariation}": ${retryError.response?.status}`);
        }
      }

      if (responseData.count === 0 && responseData.total === 0) {
        console.log("🔍 EMAIL RETRY: No results found with any email case variation");
      }
    }

    if (responseData.results && responseData.results.length > 0) {
      const order = responseData.results[0];

      // Fetch state information for order state
      if (order.state?.id) {
        try {
          const stateUrl = `${credentials.tracking_base_url}/states/${order.state.id}`;
          const stateResponse = await axios.get(stateUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          // Add state details to order
          order.stateDetails = stateResponse.data;

          // Extract localized state name
          const locale = credentials.tracking_state_name_locale || 'da-DK';
          if (stateResponse.data.name && stateResponse.data.name[locale]) {
            order.localizedStateName = stateResponse.data.name[locale];
          }

          // Add overall order state info for easier access
          order.orderStateInfo = {
            id: order.state.id,
            name: stateResponse.data.nameAllLocales?.find(
              (name) => name.locale === locale
            )?.value || stateResponse.data.key || "Unknown"
          };

          console.log("Added order state info:", order.orderStateInfo);

        } catch (stateError) {
          console.error('Error fetching order state details:', stateError.message);
        }
      }

      // Fetch state information for line items
      if (order.lineItems && order.lineItems.length > 0) {
        const lineItemStates = order.lineItems.map(item => {
          return {
            productName: item.name[credentials.tracking_state_name_locale || "da-DK"],
            stateId: item.state?.[0]?.state?.id
          };
        }).filter(item => item.stateId);

        console.log("Line item states to fetch:", lineItemStates);

        if (lineItemStates.length > 0) {
          const stateIds = lineItemStates.map(item => item.stateId);
          const uniqueStateIds = [...new Set(stateIds)];
          console.log("Unique state IDs to fetch:", uniqueStateIds);

          const stateDetails = {};

          for (const stateId of uniqueStateIds) {
            try {
              const stateUrl = `${credentials.tracking_base_url}/states/${stateId}`;
              console.log("Fetching line item state details from:", stateUrl);

              const stateResponse = await axios.get(stateUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });

              console.log(`State data for ${stateId}:`, stateResponse.data);
              stateDetails[stateId] = stateResponse.data;

            } catch (error) {
              console.error(`Error fetching state with ID ${stateId}:`, error.message);
            }
          }

          console.log("All line item state details:", stateDetails);

          // Add state details to line items
          const locale = credentials.tracking_state_name_locale || "da-DK";
          order.lineItems = order.lineItems.map((item) => {
            const stateId = item.state?.[0]?.state?.id;
            const stateName = stateId && stateDetails[stateId]
              ? stateDetails[stateId].nameAllLocales?.find(
                  (name) => name.locale === locale
                )?.value || stateDetails[stateId].key || "Unknown"
              : "Unknown";

            return {
              ...item,
              stateInfo: {
                id: stateId,
                name: stateName
              }
            };
          });

          console.log("Enhanced line items with state info:",
            order.lineItems.map((item) => ({
              product: item.name[locale],
              state: item.stateInfo
            }))
          );
        }
      }

      return order;
    }

    return null;
  } catch (error) {
    console.error('Error fetching order from Commerce Tools:', error.response?.data || error.message);
    throw error;
  }
}

// Extract relevant order details (moved from frontend)
export function extractRelevantCommerceToolsOrderDetails(order) {
  console.log("🔍 extractRelevantCommerceToolsOrderDetails - Processing order:", order.orderNumber);

  const orderLocale = order.locale || 'da-DK';
  const orderCountry = order.country || orderLocale.split('-')[1]?.toUpperCase();

  const simplifiedLineItems = order.lineItems?.map((item) => {
    let actualUnitPriceCent = item.price.value.centAmount;
    let originalUnitPriceBeforeProductDiscountCent = item.price.value.centAmount;
    let itemCurrencyCode = item.price.value.currencyCode;
    let specificDiscountApplied = false;

    if (item.variant && item.variant.prices && item.variant.prices.length > 0) {
      const relevantPriceEntry =
        item.variant.prices.find(p => p.country === orderCountry && p.value.currencyCode === itemCurrencyCode) ||
        item.variant.prices.find(p => !p.country && p.value.currencyCode === itemCurrencyCode) ||
        item.variant.prices.find(p => p.country === orderCountry) ||
        item.variant.prices[0];

      if (relevantPriceEntry) {
        originalUnitPriceBeforeProductDiscountCent = relevantPriceEntry.value.centAmount;
        itemCurrencyCode = relevantPriceEntry.value.currencyCode;

        if (relevantPriceEntry.discounted && relevantPriceEntry.discounted.value.centAmount < relevantPriceEntry.value.centAmount) {
          actualUnitPriceCent = relevantPriceEntry.discounted.value.centAmount;
          specificDiscountApplied = true;
        } else {
          actualUnitPriceCent = relevantPriceEntry.value.centAmount;
        }
      }
    }

    return {
      productName: item.name[orderLocale] || item.name[Object.keys(item.name)[0]],
      quantity: item.quantity,
      unitPrice: actualUnitPriceCent / 100,
      originalUnitPrice: originalUnitPriceBeforeProductDiscountCent / 100,
      totalLinePrice: (actualUnitPriceCent * item.quantity) / 100,
      currencyCode: itemCurrencyCode,
      state: item.stateInfo?.name || "Unknown",
      sku: item.variant?.sku,
      images: item.variant?.images?.map((img) => img.url) || [],
      specificDiscountApplied: specificDiscountApplied,
    };
  }) || [];

  // Check if discount code was used (cart level discount)
  const hasDiscountCode = order.discountCodes && order.discountCodes.length > 0;

  // Construct simplified order object with only relevant information
  return {
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    status: order.orderStateInfo?.name || "Unknown",
    customer: {
      firstName: order.shippingAddress?.firstName,
      lastName: order.shippingAddress?.lastName,
      email: order.shippingAddress?.email,
      phone: order.shippingAddress?.phone || order.shippingAddress?.mobile,
    },
    shipping: {
      method: order.shippingInfo?.shippingMethodName,
      address: {
        street: order.shippingAddress?.streetName,
        city: order.shippingAddress?.city,
        postalCode: order.shippingAddress?.postalCode,
        country: order.shippingAddress?.country,
      },
      dropPoint: order.custom?.fields?.["order-field-DeliveryDropPointName"],
      trackingInfo: order.custom?.fields?.["order-field-ShipmentUrl"],
      deliveredDate: order.custom?.fields?.["order-field-DeliveredSetDate"],
    },
    payment: {
      totalPrice: order.totalPrice?.centAmount / 100,
      currencyCode: order.totalPrice?.currencyCode,
    },
    discount: {
      hasDiscountCode: hasDiscountCode,
      discountCodeDetails: hasDiscountCode ? order.discountCodes.map(code => ({
        id: code.discountCode.id,
        state: code.state
      })) : []
    },
    invoiceUrl: order.custom?.fields?.["order-field-PdfUrl"],
    items: simplifiedLineItems,
  };
}
