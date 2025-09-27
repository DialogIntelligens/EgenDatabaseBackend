import { buildPrompt } from '../../promptTemplateV2Routes.js';

/**
 * Order Tracking Service
 * Handles all order tracking logic migrated from frontend
 */
export class OrderTrackingService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Extract order variables using apiVarFlow
   * Migrated from frontend API flow logic
   */
  async extractOrderVariables(messageText, conversationHistory, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Entering apiVarFlow with template-based system");
      
      // Check if apiVarFlow is enabled
      if (!configuration.apiVarFlowPromptEnabled) {
        console.log("🚨 FLOW ROUTING: No apiVarFlow template configured, skipping variable extraction");
        return {};
      }

      // Get apiVarFlow prompt
      const apiVarFlowPrompt = await buildPrompt(this.pool, configuration.chatbot_id, 'apivarflow');
      
      const bodyObjectVarFlow = { 
        question: messageText, 
        history: conversationHistory 
      };
      
      // Apply configuration overrides
      this.applyConfigurationOverrides(bodyObjectVarFlow, configuration);
      
      // Add apivarflow prompt template
      bodyObjectVarFlow.overrideConfig = bodyObjectVarFlow.overrideConfig || {};
      bodyObjectVarFlow.overrideConfig.vars = bodyObjectVarFlow.overrideConfig.vars || {};
      bodyObjectVarFlow.overrideConfig.vars.fordelingsprompt = apiVarFlowPrompt;
      
      console.log("🚨 FLOW ROUTING: Applied validated apivarflow prompt override");
      
      const fetchOptionsVarFlow = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer YOUR_API_KEY",
        },
        body: JSON.stringify(bodyObjectVarFlow),
      };
      
      // Use standard API for variable extraction
      const standardApi = "https://den-utrolige-snebold.onrender.com/api/v1/prediction/52c2cdfa-581f-4a0f-b70e-4f617ed0029e";
      console.log("🚨 FLOW ROUTING: Sending apivarflow request to:", standardApi);
      
      const response = await fetch(standardApi, fetchOptionsVarFlow);
      
      if (!response.ok) {
        throw new Error(`ApiVarFlow API failed: ${response.status}`);
      }
      
      const result = await response.json();
      const apiResult = result.text;
      console.log("🚨 FLOW ROUTING: Template-based apiVarFlow result:", apiResult);
      
      // Parse using the parentheses format (orderVariables)
      const orderVariables = {};
      const regex = /\(([^:]+):([^)]*)\)/g;
      let match;
      let matchFound = false;
      
      while ((match = regex.exec(apiResult)) !== null) {
        matchFound = true;
        const key = match[1].trim();
        const value = match[2].trim();
        orderVariables[key] = value;
      }
      
      if (matchFound) {
        console.log("Order variables (parentheses format):", orderVariables);
        console.log("🔍 ORDER VARIABLES: Extracted variables:", Object.keys(orderVariables));
        console.log("🔍 ORDER VARIABLES: Values:", JSON.stringify(orderVariables, null, 2));
      } else {
        console.warn("Unrecognized order variable format. Expected parentheses format: (key:value)");
        console.log("Raw API result:", apiResult);
      }
      
      return orderVariables;
      
    } catch (error) {
      console.error("🚨 FLOW ROUTING: Error in apiVarFlow:", error);
      return {};
    }
  }

  /**
   * Handle order tracking based on extracted variables
   * Migrated from frontend order tracking logic
   */
  async handleOrderTracking(orderVariables, configuration) {
    try {
      const { trackingRequiredFields = ['order_number', 'email'] } = configuration;
      
      // Extract provided fields for tracking
      const providedFields = trackingRequiredFields.filter(field => 
        orderVariables[field] && orderVariables[field].trim() !== ""
      );
      
      console.log("🚨 FLOW ROUTING: Order tracking check - providedFields:", providedFields.length);
      console.log("🚨 FLOW ROUTING: Required fields:", trackingRequiredFields);
      console.log("🚨 FLOW ROUTING: DEBUG - orderVariables:", orderVariables);

      // Check tracking conditions based on enabled systems
      let trackingConditionMet = false;
      
      if (configuration.shopifyEnabled) {
        trackingConditionMet = await this.checkShopifyCondition(orderVariables);
      } else if (configuration.magentoEnabled) {
        trackingConditionMet = await this.checkMagentoCondition(orderVariables);
      } else if (configuration.orderTrackingEnabled) {
        // Custom tracking systems - just need any 2 fields
        trackingConditionMet = providedFields.length >= 2;
        console.log("🚨 FLOW ROUTING: Custom tracking condition check - needs any 2 from:", trackingRequiredFields, "provided:", providedFields.length);
      }
      
      console.log("🚨 FLOW ROUTING: Tracking systems enabled - shopify:", configuration.shopifyEnabled, "magento:", configuration.magentoEnabled, "orderTracking:", configuration.orderTrackingEnabled);
      console.log("🚨 FLOW ROUTING: Tracking condition met:", trackingConditionMet);

      if (trackingConditionMet) {
        console.log("🚨 FLOW ROUTING: ✅ Tracking condition met, proceeding with API calls");
        
        if (configuration.shopifyEnabled) {
          return await this.handleShopifyTracking(orderVariables, configuration);
        } else if (configuration.magentoEnabled) {
          return await this.handleMagentoTracking(orderVariables, configuration);
        } else if (configuration.orderTrackingEnabled) {
          return await this.handleCustomTracking(orderVariables, configuration);
        }
      } else {
        console.log("🚨 FLOW ROUTING: ❌ Order tracking condition NOT met");
        return null;
      }
    } catch (error) {
      console.error("🚨 FLOW ROUTING: Error during order tracking:", error);
      return null;
    }
  }

  /**
   * Check Shopify tracking condition
   */
  async checkShopifyCondition(orderVariables) {
    const hasOrderNumber = orderVariables.order_number && orderVariables.order_number.trim() !== "";
    const hasEmail = orderVariables.email && orderVariables.email.trim() !== "";
    const hasPhone = orderVariables.phone && orderVariables.phone.trim() !== "";
    
    const conditionMet = hasOrderNumber && (hasEmail || hasPhone);
    console.log("🚨 FLOW ROUTING: Shopify condition check - order_number:", hasOrderNumber, "email:", hasEmail, "phone:", hasPhone, "condition met:", conditionMet);
    return conditionMet;
  }

  /**
   * Check Magento tracking condition
   */
  async checkMagentoCondition(orderVariables) {
    const hasOrderNumber = orderVariables.order_number && orderVariables.order_number.trim() !== "";
    const hasEmail = orderVariables.email && orderVariables.email.trim() !== "";
    const hasPhone = orderVariables.phone && orderVariables.phone.trim() !== "";
    
    const conditionMet = hasOrderNumber && (hasEmail || hasPhone);
    console.log("🚨 FLOW ROUTING: Magento condition check - order_number:", hasOrderNumber, "email:", hasEmail, "phone:", hasPhone, "condition met:", conditionMet);
    return conditionMet;
  }

  /**
   * Handle Shopify order tracking
   */
  async handleShopifyTracking(orderVariables, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Making Shopify tracking request");
      
      // Fetch Shopify credentials from database
      const credentialsResponse = await this.pool.query(`
        SELECT shopify_store, shopify_access_token
        FROM shopify_credentials
        WHERE chatbot_id = $1
      `, [configuration.chatbot_id]);

      let shopifyRequestBody;

      if (credentialsResponse.rows.length > 0) {
        const credentials = credentialsResponse.rows[0];
        console.log("🔑 SHOPIFY: Retrieved credentials for store:", credentials.shopify_store);

        shopifyRequestBody = {
          shopifyStore: credentials.shopify_store,
          shopifyAccessToken: credentials.shopify_access_token,
          shopifyApiVersion: '2024-10', // Hardcoded as in the old code
          chatbot_id: configuration.chatbot_id
        };
      } else {
        console.log("🔑 SHOPIFY: Database credentials not found, will let backend handle credential lookup");
        shopifyRequestBody = {
          chatbot_id: configuration.chatbot_id,
          shopifyApiVersion: '2024-10'
        };
      }
    
      // Add available order variables to Shopify request
      if (orderVariables.email) shopifyRequestBody.email = orderVariables.email;
      if (orderVariables.phone) shopifyRequestBody.phone = orderVariables.phone;
      if (orderVariables.order_number) shopifyRequestBody.order_number = orderVariables.order_number;
      if (orderVariables.name) shopifyRequestBody.name = orderVariables.name;
      
      console.log("🚨 FLOW ROUTING: Shopify request body:", JSON.stringify(shopifyRequestBody, null, 2));
      
      // Make Shopify API request via existing backend endpoint
      const shopifyResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/shopify/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shopifyRequestBody)
      });
      
      if (shopifyResponse.ok) {
        const shopifyData = await shopifyResponse.json();
        console.log("🚨 FLOW ROUTING: Shopify API response received");
        
        // Log filtering results if available
        if (shopifyData.filtered_from && shopifyData.filtered_from > shopifyData.total_count) {
          console.log(`🔍 SHOPIFY FILTERING: ${shopifyData.filtered_from - shopifyData.total_count} orders were filtered out. ${shopifyData.total_count} orders matched all criteria.`);
        }
        
        return shopifyData;
      } else {
        const errorText = await shopifyResponse.text();
        console.error("🚨 FLOW ROUTING: Shopify API error:", shopifyResponse.status, errorText);
        return null;
      }
    } catch (error) {
      console.error("🔑 SHOPIFY: Error in Shopify tracking:", error);
      return null;
    }
  }

  /**
   * Handle Magento order tracking
   */
  async handleMagentoTracking(orderVariables, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Making Magento tracking request");
      
      // Fetch Magento credentials from database
      const credentialsResponse = await this.pool.query(`
        SELECT magento_base_url, magento_consumer_key, magento_consumer_secret, 
               magento_access_token, magento_token_secret 
        FROM magento_credentials 
        WHERE chatbot_id = $1
      `, [configuration.chatbot_id]);
      
      let magentoRequestBody;

      if (credentialsResponse.rows.length > 0) {
        const credentials = credentialsResponse.rows[0];
        console.log("🔑 MAGENTO: Retrieved credentials for base URL:", credentials.magento_base_url);

        magentoRequestBody = {
          magentoBaseUrl: credentials.magento_base_url,
          magentoConsumerKey: credentials.magento_consumer_key,
          magentoConsumerSecret: credentials.magento_consumer_secret,
          magentoAccessToken: credentials.magento_access_token,
          magentoTokenSecret: credentials.magento_token_secret,
          chatbot_id: configuration.chatbot_id
        };
      } else {
        console.log("🔑 MAGENTO: Database credentials not found, will let backend handle credential lookup");
        magentoRequestBody = {
          chatbot_id: configuration.chatbot_id
        };
      }

      // Add available order variables to Magento request
      if (orderVariables.email) magentoRequestBody.email = orderVariables.email;
      if (orderVariables.phone) magentoRequestBody.phone = orderVariables.phone;
      if (orderVariables.order_number) magentoRequestBody.order_number = orderVariables.order_number;
      if (orderVariables.name) magentoRequestBody.name = orderVariables.name;

      console.log("🚨 FLOW ROUTING: Magento request body:", JSON.stringify(magentoRequestBody, null, 2));

      // Make Magento API request via existing backend endpoint
      const magentoResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/magento/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(magentoRequestBody)
      });

      if (magentoResponse.ok) {
        const magentoData = await magentoResponse.json();
        console.log("🚨 FLOW ROUTING: ✅ Magento API response received");
        
        // Log filtering results if available
        if (magentoData.filtered_from && magentoData.filtered_from > magentoData.total_count) {
          console.log(`🔍 MAGENTO FILTERING: ${magentoData.filtered_from - magentoData.total_count} orders were filtered out. ${magentoData.total_count} orders matched all criteria.`);
        }

        return magentoData;
      } else {
        const errorText = await magentoResponse.text();
        console.error("🚨 FLOW ROUTING: Magento API error:", magentoResponse.status, errorText);
        return null;
      }
    } catch (error) {
      console.error("🔑 MAGENTO: Error in Magento tracking:", error);
      return null;
    }
  }

  /**
   * Handle custom order tracking (BevCo, Commerce Tools, etc.)
   */
  async handleCustomTracking(orderVariables, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Making custom tracking request for chatbot:", configuration.chatbot_id);
      
      // Check if this is Commerce Tools (should use backend)
      if (configuration.chatbot_id === 'dillingdk') {
        console.log("🚨 FLOW ROUTING: Using Commerce Tools backend for DILLING");
        
        const commerceToolsResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/track-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatbot_id: configuration.chatbot_id,
            order_number: orderVariables.order_number,
            email: orderVariables.email
          })
        });
        
        if (commerceToolsResponse.ok) {
          const commerceToolsData = await commerceToolsResponse.json();
          console.log("🚨 FLOW ROUTING: ✅ Commerce Tools response received");
          return commerceToolsData;
        } else {
          const errorText = await commerceToolsResponse.text();
          console.error("🚨 FLOW ROUTING: Commerce Tools error:", commerceToolsResponse.status, errorText);
          return null;
        }
      } else if (configuration.orderTrackingUrl) {
        // Handle other custom tracking systems (BevCo, etc.)
        return await this.handleGenericTracking(orderVariables, configuration);
      }
      
      return null;
    } catch (error) {
      console.error("🚨 FLOW ROUTING: Error during custom tracking:", error);
      return null;
    }
  }

  /**
   * Handle generic tracking systems
   */
  async handleGenericTracking(orderVariables, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Making standard tracking request with orderTrackingUrl:", configuration.orderTrackingUrl);
    
      let getUrl = configuration.orderTrackingUrl;
      let requestBody = null;
      
      // Determine if we should use the proxy
      const useProxy = configuration.trackingUseProxy && configuration.trackingProxyUrl;
      const targetUrl = useProxy ? configuration.trackingProxyUrl : getUrl;
      
      if (configuration.trackingRequestMethod === 'GET') {
        // For GET requests, replace placeholders in the URL
        configuration.trackingRequiredFields.forEach(field => {
          const placeholder = `${field.toUpperCase()}_PLACEHOLDER`;
          let value = orderVariables[field] || '';
          getUrl = getUrl.replace(placeholder, encodeURIComponent(value));
        });
      } else if (configuration.trackingRequestMethod === 'POST' && configuration.trackingRequestBody) {
        // For POST requests, prepare the request body with actual values
        try {
          requestBody = JSON.parse(configuration.trackingRequestBody);
        } catch (e) {
          requestBody = {};
          console.error("Error parsing tracking request body template:", e);
        }
        
        // Fill in the values from our order variables
        Object.keys(orderVariables).forEach(key => {
          if (orderVariables[key]) {
            requestBody[key] = orderVariables[key];
          }
        });
      }
      
      // Prepare headers
      let headers = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      
      if (!useProxy) {
        // Only add custom headers if we're not using the proxy
        headers = {
          ...headers,
          ...configuration.trackingCustomHeaders
        };
      }
      
      console.log(`Making ${configuration.trackingRequestMethod} request to ${useProxy ? targetUrl : getUrl}`);
      
      const getResponse = await fetch(useProxy ? targetUrl : getUrl, {
        method: configuration.trackingRequestMethod,
        headers: headers,
        ...(requestBody && { body: JSON.stringify(requestBody) })
      });
      
      if (!getResponse.ok) {
        const errorBody = await getResponse.text();
        console.error(`Order tracking request failed: ${getResponse.status}`, errorBody);
        throw new Error(`Order tracking request failed: ${getResponse.status}`);
      }
      
      let responseData = await getResponse.json();
      console.log("Tracking API response:", JSON.stringify(responseData, null, 2));
      return responseData;
      
    } catch (trackingError) {
      console.error("🚨 FLOW ROUTING: Error during generic tracking:", trackingError);
      return null;
    }
  }

  /**
   * Extract relevant order details for AI context
   * Migrated from frontend extractRelevantOrderDetails function
   */
  extractRelevantOrderDetails(orderDetails) {
    console.log("🔍 extractRelevantOrderDetails - Raw input:", orderDetails);
    
    // Handle CommerceTools format
    if (orderDetails?.results?.[0]) {
      console.log("🔍 Detected CommerceTools format");
      return this.extractCommerceToolsDetails(orderDetails.results[0]);
    }
    // Handle Shopify format (check for success flag first)
    else if (orderDetails?.orders?.length > 0 && orderDetails.success) {
      console.log("🔍 Detected Shopify format with", orderDetails.orders.length, "orders");
      return this.extractShopifyDetails(orderDetails.orders);
    }
    // Handle Magento format (check before BevCo since both have .orders)
    else if (orderDetails?.orders?.length > 0 && orderDetails.orders[0]?.magentoBaseUrl) {
      console.log("🔍 Detected Magento format with", orderDetails.orders.length, "orders");
      return this.extractMagentoDetails(orderDetails.orders);
    }
    // Handle BevCo format (after Shopify and Magento checks)
    else if (orderDetails?.orders?.length > 0) {
      console.log("🔍 Detected BevCo format with", orderDetails.orders.length, "orders");
      return this.extractBevCoDetails(orderDetails.orders);
    }
    
    console.log("🔍 No recognized format detected, returning null");
    return null;
  }

  /**
   * Extract Commerce Tools order details
   */
  extractCommerceToolsDetails(order) {
    const orderLocale = order.locale || 'de-DE';
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

    const hasDiscountCode = order.discountCodes && order.discountCodes.length > 0;
    
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

  /**
   * Extract Shopify order details
   */
  extractShopifyDetails(orders) {
    const simplifiedOrders = orders.map(order => {
      const simplifiedLineItems = order.line_items?.map(item => ({
        id: item.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price),
        totalPrice: parseFloat(item.price) * item.quantity,
        fulfillmentStatus: item.fulfillment_status,
        sku: item.sku,
        productId: item.product_id,
        variantId: item.variant_id,
      })) || [];

      const itemsTotal = simplifiedLineItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        orderDate: order.created_at,
        lastUpdated: order.updated_at,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        customer: {
          name: order.customer_name,
          email: order.email,
          phone: order.phone,
        },
        shipping: {
          address: order.shipping_address ? {
            name: order.shipping_address.name,
            company: order.shipping_address.company,
            address1: order.shipping_address.address1,
            address2: order.shipping_address.address2,
            city: order.shipping_address.city,
            province: order.shipping_address.province,
            zip: order.shipping_address.zip,
            country: order.shipping_address.country,
            phone: order.shipping_address.phone,
          } : null,
        },
        billing: {
          address: order.billing_address ? {
            name: order.billing_address.name,
            company: order.billing_address.company,
            address1: order.billing_address.address1,
            address2: order.billing_address.address2,
            city: order.billing_address.city,
            province: order.billing_address.province,
            zip: order.billing_address.zip,
            country: order.billing_address.country,
            phone: order.billing_address.phone,
          } : null,
        },
        payment: {
          totalPrice: parseFloat(order.total_price),
          currency: order.currency,
          financialStatus: order.financial_status,
          itemsTotal: itemsTotal,
        },
        items: simplifiedLineItems,
        itemCount: simplifiedLineItems.length,
        totalQuantity: simplifiedLineItems.reduce((sum, item) => sum + item.quantity, 0),
        tracking: {
          hasTracking: !!(order.primary_tracking?.tracking_number || order.primary_tracking?.tracking_url),
          trackingNumber: order.primary_tracking?.tracking_number,
          trackingUrl: order.primary_tracking?.tracking_url,
          trackingCompany: order.primary_tracking?.tracking_company,
          shipmentStatus: order.primary_tracking?.shipment_status,
          fulfillmentStatus: order.primary_tracking?.status,
        },
        fulfillments: order.fulfillments ? order.fulfillments.map(fulfillment => ({
          id: fulfillment.id,
          status: fulfillment.status,
          trackingCompany: fulfillment.tracking_company,
          trackingNumber: fulfillment.tracking_number,
          trackingUrl: fulfillment.tracking_url,
          trackingUrls: fulfillment.tracking_urls || [],
          shipmentStatus: fulfillment.shipment_status,
          createdAt: fulfillment.created_at,
          updatedAt: fulfillment.updated_at,
          fulfilledItems: fulfillment.line_items || [],
        })) : [],
        shippingStatus: {
          isShipped: order.fulfillment_status === 'fulfilled' || order.fulfillment_status === 'partial',
          canTrack: !!(order.primary_tracking?.tracking_number || order.primary_tracking?.tracking_url),
          statusText: order.fulfillment_status,
          estimatedDelivery: order.estimated_delivery || null,
        },
        orderUrl: order.shopifyStore
          ? `https://${order.shopifyStore}.myshopify.com/admin/orders/${order.id}`
          : null,
        tags: order.tags || [],
        notes: order.note,
        isPreorder: (order.tags || []).some(tag =>
          tag.toLowerCase().includes('preorder') ||
          tag.toLowerCase().includes('pre-order') ||
          tag.toLowerCase().includes('forudbestilling')
        ),
      };
    });

    return simplifiedOrders.length === 1 ? simplifiedOrders[0] : simplifiedOrders;
  }

  /**
   * Extract Magento order details
   */
  extractMagentoDetails(orders) {
    const simplifiedOrders = orders.map(order => {
      const simplifiedLineItems = order.line_items?.map(item => ({
        productName: item.name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price),
        totalPrice: parseFloat(item.price) * item.quantity,
        sku: item.sku,
      })) || [];
    
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        orderDate: order.created_at,
        lastUpdated: order.updated_at,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        customer: {
          name: order.customer_name,
          email: order.email,
          phone: order.phone,
        },
        shipping: {
          address: order.shipping_address ? {
            name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
            address1: order.shipping_address.address1,
            address2: order.shipping_address.address2,
            city: order.shipping_address.city,
            province: order.shipping_address.province,
            zip: order.shipping_address.zip,
            country: order.shipping_address.country,
            phone: order.shipping_address.phone,
          } : null,
        },
        billing: {
          address: order.billing_address ? {
            name: `${order.billing_address.first_name} ${order.billing_address.last_name}`,
            address1: order.billing_address.address1,
            address2: order.billing_address.address2,
            city: order.billing_address.city,
            province: order.billing_address.province,
            zip: order.billing_address.zip,
            country: order.billing_address.country,
            phone: order.billing_address.phone,
          } : null,
        },
        payment: {
          totalPrice: parseFloat(order.total_price),
          currency: order.currency,
          financialStatus: order.financial_status,
        },
        items: simplifiedLineItems,
        itemCount: simplifiedLineItems.length,
        totalQuantity: simplifiedLineItems.reduce((sum, item) => sum + item.quantity, 0),
        tracking: {
          hasTracking: !!order.trackingUrl,
          trackingUrl: order.trackingUrl,
        },
        orderUrl: order.magentoBaseUrl
          ? `${order.magentoBaseUrl}/admin/sales/order/view/order_id/${order.id}`
          : null,
        tags: order.tags || [],
        notes: order.notes || '',
      };
    });

    return simplifiedOrders.length === 1 ? simplifiedOrders[0] : simplifiedOrders;
  }

  /**
   * Extract BevCo order details
   */
  extractBevCoDetails(orders) {
    const simplifiedOrders = orders.map(ord => {
      const simplifiedLineItems = ord.line_items?.map(item => ({
        productName: item.product_name,
        quantity: item.quantity,
        price: item.unit_price,
        totalPrice: item.total_price,
        productNumber: item.product_number,
      })) || [];
    
      return {
        orderNumber: ord.order_number,
        orderDate: ord.order_date,
        status: ord.order_status,
        customer: {
          firstName: ord.shipping_address?.firstname,
          lastName: ord.shipping_address?.lastname,
          email: ord.email,
          phone: ord.phone,
        },
        shipping: {
          method: ord.shipping_method,
          cost: ord.shipping_cost,
          address: {
            street: ord.shipping_address?.address,
            city: ord.shipping_address?.city,
            postalCode: ord.shipping_address?.zip,
          },
          trackingInfo: ord.tracking_url,
        },
        payment: {
          status: ord.payment_status,
          totalPrice: ord.total_price,
        },
        items: simplifiedLineItems,
      };
    });

    return simplifiedOrders.length === 1 ? simplifiedOrders[0] : simplifiedOrders;
  }

  /**
   * Apply configuration overrides to request body
   */
  applyConfigurationOverrides(requestBody, configuration) {
    const { websiteOverride, languageOverride, valutaOverride, dillingproductkatoverride, dillingcolors, customVar1 } = configuration;

    if (websiteOverride || languageOverride || valutaOverride || dillingproductkatoverride || dillingcolors || customVar1) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.vars = requestBody.overrideConfig.vars || {};
      
      if (websiteOverride) requestBody.overrideConfig.vars.website = websiteOverride;
      if (languageOverride) requestBody.overrideConfig.vars.language = languageOverride;
      if (valutaOverride) requestBody.overrideConfig.vars.valuta = valutaOverride;
      if (dillingproductkatoverride) requestBody.overrideConfig.vars.dillingproductkat = dillingproductkatoverride;
      if (dillingcolors) requestBody.overrideConfig.vars.dillingcolors = dillingcolors;
      if (customVar1) requestBody.overrideConfig.vars.customVar1 = customVar1;
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createOrderTrackingService(pool) {
  return new OrderTrackingService(pool);
}
