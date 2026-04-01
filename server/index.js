const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Twilio = require('twilio');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const ownerWhatsAppNumber = process.env.OWNER_WHATSAPP_NUMBER || '+919482207429';
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

console.log('🔧 Initializing Twilio...');
console.log('Owner WhatsApp:', ownerWhatsAppNumber);
console.log('Twilio From:', twilioWhatsAppFrom);
console.log('Twilio Account SID:', twilioAccountSid ? 'SET ✓' : 'MISSING ✗');
console.log('Twilio Auth Token:', twilioAuthToken ? 'SET ✓' : 'MISSING ✗');

if (!twilioAccountSid || !twilioAuthToken) {
  console.warn('⚠️  Twilio credentials are missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment.');
}

const twilioClient = twilioAccountSid && twilioAuthToken ? Twilio(twilioAccountSid, twilioAuthToken) : null;
console.log('Twilio Client Status:', twilioClient ? '✓ Initialized' : '✗ Not configured');

// Shiprocket configuration
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL || 'gowthami.codot@gmail.com';
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD || 'NBNIsSKidXEF$hXq0JYZC@j!yWavQaNv';
const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

// Shiprocket authentication cache
let shiprocketToken = null;
let tokenExpiry = null;

console.log('🚀 Initializing Shiprocket...');
console.log('Shiprocket Email:', SHIPROCKET_EMAIL ? 'SET ✓' : 'MISSING ✗');
console.log('Shiprocket Password:', SHIPROCKET_PASSWORD ? 'SET ✓' : 'MISSING ✗');

// Shiprocket functions
async function getShiprocketToken() {
  if (shiprocketToken && tokenExpiry && Date.now() < tokenExpiry) {
    return shiprocketToken;
  }

  try {
    console.log('🔐 Authenticating with Shiprocket...');
    const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email: SHIPROCKET_EMAIL,
      password: SHIPROCKET_PASSWORD
    });

    shiprocketToken = response.data.token;
    // Token expires in 10 days (864000000 ms)
    tokenExpiry = Date.now() + (10 * 24 * 60 * 60 * 1000);
    console.log('✅ Shiprocket token obtained successfully');
    return shiprocketToken;
  } catch (error) {
    console.error('❌ Shiprocket authentication failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createShiprocketOrder(orderData) {
  try {
    const token = await getShiprocketToken();

    // Use custom pickup location name if provided, otherwise use "Home"
    // Important: Use the location NAME (e.g., "Home"), not the ID (e.g., "51448280")
    const pickupLocationName = orderData.pickupLocationName || "Home";

    const finalOrderId = orderData.orderId || orderData.paymentId || 'BWL-' + Date.now();

    const shiprocketOrder = {
      order_id: finalOrderId,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: pickupLocationName,
      is_hyperlocal: 1,
      order_type: "ESSENTIALS",
      channel_id: "",
      comment: "Order from Bowl Owl website",
      billing_customer_name: orderData.user.name || "Customer",
      billing_last_name: "",
      billing_address: orderData.user.address || "No Address Provided",
      billing_address_2: orderData.user.locality || "",
      billing_city: orderData.user.city || "Unknown City",
      billing_pincode: orderData.user.pincode || "000000",
      billing_state: orderData.user.state || "Unknown State",
      billing_country: "India",
      billing_email: orderData.user.email || "no-email@example.com",
      billing_phone: orderData.user.phone || "0000000000",
      shipping_is_billing: true,
      shipping_customer_name: orderData.user.name || "Customer",
      shipping_last_name: "",
      shipping_address: orderData.user.address || "No Address Provided",
      shipping_address_2: orderData.user.locality || "",
      shipping_city: orderData.user.city || "Unknown City",
      shipping_pincode: orderData.user.pincode || "000000",
      shipping_state: orderData.user.state || "Unknown State",
      shipping_country: "India",
      shipping_email: orderData.user.email || "no-email@example.com",
      shipping_phone: orderData.user.phone || "0000000000",
      order_items: orderData.cartItems.map(item => ({
        name: item.name,
        sku: item.name.replace(/\s+/g, '-').toLowerCase(),
        units: item.quantity,
        selling_price: parseFloat(item.price.replace('₹', '')),
        discount: 0,
        tax: 0,
        hsn: ""
      })),
      payment_method: "Prepaid",
      shipping_charges: 50,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: 0,
      sub_total: orderData.total - 50,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5
    };

    console.log('📦 Creating Shiprocket order with pickup location:', pickupLocationName);
    console.log('📋 Order payload:', JSON.stringify(shiprocketOrder, null, 2));

    const response = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, shiprocketOrder, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Shiprocket order created successfully');
    console.log('📊 Full API Response:', JSON.stringify(response.data, null, 2));
    console.log('Order ID:', response.data.order_id || response.data.shipment_id || 'Check response above');
    return response.data;
  } catch (error) {
    console.error('❌ Shiprocket order creation failed');
    console.error('Status:', error.response?.status);
    console.error('Error Message:', error.response?.data?.message);
    console.error('Full Error Response:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static files from the application root.
// __dirname is .../public_html/public_html/server, so parent is .../public_html/public_html.
app.use(express.static(path.join(__dirname, '..')));

app.post('/api/order-notification', async (req, res) => {
  console.log('\n📨 /api/order-notification POST received');

  if (!twilioClient) {
    console.error('❌ Twilio client not configured');
    return res.status(500).json({ error: 'Twilio client is not configured' });
  }

  const { cartItems = [], total, currency, paymentId, orderId, user } = req.body;

  console.log('\n📋 FULL PAYLOAD RECEIVED:');
  console.log('User:', JSON.stringify(user, null, 2));
  console.log('Cart Items:', JSON.stringify(cartItems, null, 2));
  console.log('Total:', total);
  console.log('Payment ID:', paymentId);
  console.log('Order ID:', orderId);

  if (typeof total !== 'number' || total <= 0) {
    console.error('❌ Invalid total:', total);
    return res.status(400).json({ error: 'Total amount is required' });
  }

  const messageLines = [
    '📦 New order received',
    `🧾 Total: ${currency || 'INR'} ${total.toFixed(2)}`,
    paymentId ? `💳 Payment ID: ${paymentId}` : null,
    orderId ? `🆔 Order ID: ${orderId}` : null,
    '',
    '👤 CUSTOMER INFO:',
    user?.name ? `Name: ${user.name}` : null,
    user?.email ? `Email: ${user.email}` : null,
    user?.phone ? `Phone: ${user.phone}` : null,
    user?.pincode ? `Pincode: ${user.pincode}` : null,
    user?.address ? `Address: ${user.address}` : null,
    user?.locality ? `Locality: ${user.locality}` : null,
    user?.city ? `City: ${user.city}` : null,
    user?.state ? `State: ${user.state}` : null,
    '',
    '🛒 ITEMS:',
    ...cartItems.map(item => {
      const deliveryInfo = item.date || item.time ? ` [${item.date || ''}${item.date && item.time ? ' at ' : ''}${item.time || ''}]` : '';
      return `- ${item.name} x${item.quantity || 1} (${item.price || '₹0'})${deliveryInfo}`;
    })
  ].filter(Boolean);

  const messageBody = messageLines.join('\n');
  console.log('📝 Message to send:', messageBody);
  console.log(`📤 Sending from: ${twilioWhatsAppFrom} → to: whatsapp:${ownerWhatsAppNumber}`);

  try {
    const message = await twilioClient.messages.create({
      body: messageBody,
      from: twilioWhatsAppFrom,
      to: `whatsapp:${ownerWhatsAppNumber}`
    });

    console.log('✅ WhatsApp message sent successfully. SID:', message.sid);

    // Create Shiprocket order
    try {
      const shiprocketResult = await createShiprocketOrder({
        orderId: orderId,
        paymentId: paymentId,
        user: user,
        cartItems: cartItems,
        total: total
      });
      console.log('✅ Order successfully created in Shiprocket:', shiprocketResult);
    } catch (shiprocketError) {
      console.warn('⚠️ Shiprocket order creation failed, but WhatsApp notification was sent:', shiprocketError.message);
    }

    return res.status(200).json({ success: true, messageSid: message.sid });
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message');
    console.error('Error details:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    return res.status(502).json({ error: 'Failed to send WhatsApp message', details: error.message });
  }
});

app.post('/api/test-shiprocket-auth', async (req, res) => {
  console.log('\n🔐 Testing Shiprocket authentication only...');

  try {
    const token = await getShiprocketToken();
    console.log('✅ Shiprocket authentication successful!');
    return res.status(200).json({
      success: true,
      message: 'Shiprocket authentication successful',
      token: token.substring(0, 20) + '...'
    });
  } catch (error) {
    console.error('❌ Shiprocket authentication failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Shiprocket authentication failed',
      error: error.message
    });
  }
});

app.get('/api/shiprocket-locations', async (req, res) => {
  console.log('\n📍 Fetching Shiprocket pickup locations...');

  try {
    const token = await getShiprocketToken();
    const response = await axios.get(`${SHIPROCKET_BASE_URL}/settings/pickup`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Pickup locations fetched successfully!');
    return res.status(200).json({
      success: true,
      locations: response.data.data || []
    });
  } catch (error) {
    console.error('❌ Failed to fetch pickup locations:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post('/api/test-shiprocket', async (req, res) => {
  console.log('\n🧪 Testing Shiprocket integration with dummy data...');

  const dummyOrderData = {
    orderId: 'TEST-' + Date.now(),
    user: {
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '8296746784',  // Valid Indian phone number (10 digits)
      address: '123 Test Street, Test Area',
      locality: 'Test Locality',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    },
    cartItems: [
      {
        name: 'Banana Bowl',
        quantity: 1,
        price: '₹150.00'
      },
      {
        name: 'Coco Cloud',
        quantity: 2,
        price: '₹200.00'
      }
    ],
    total: 550
  };

  try {
    const shiprocketResult = await createShiprocketOrder(dummyOrderData);
    console.log('✅ Test Shiprocket order created successfully!');
    return res.status(200).json({
      success: true,
      message: 'Shiprocket test order created successfully',
      orderId: shiprocketResult.order_id,
      result: shiprocketResult
    });
  } catch (error) {
    console.error('❌ Shiprocket test failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Shiprocket test failed',
      error: error.message
    });
  }
});

app.post('/api/test-shiprocket-with-location', async (req, res) => {
  console.log('\n🧪 Testing Shiprocket order with custom pickup location...');

  const { pickupLocation } = req.body;

  if (!pickupLocation) {
    return res.status(400).json({
      success: false,
      message: 'Pickup location is required',
      error: 'Missing pickupLocation parameter'
    });
  }

  const dummyOrderData = {
    orderId: 'TEST-' + Date.now(),
    user: {
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '8296746784',
      address: '123 Test Street, Test Area',
      locality: 'Test Locality',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    },
    cartItems: [
      {
        name: 'Banana Bowl',
        quantity: 1,
        price: '₹150.00'
      },
      {
        name: 'Coco Cloud',
        quantity: 2,
        price: '₹200.00'
      }
    ],
    total: 550,
    pickupLocationName: pickupLocation  // Use location NAME, not ID
  };

  try {
    const shiprocketResult = await createShiprocketOrder(dummyOrderData);
    console.log('✅ Shiprocket order with custom location created successfully!');
    return res.status(200).json({
      success: true,
      message: 'Shiprocket order created successfully with custom pickup location',
      orderId: shiprocketResult.order_id,
      result: shiprocketResult
    });
  } catch (error) {
    console.error('❌ Shiprocket test with custom location failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Shiprocket test failed',
      error: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../cart.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server listening on port ${PORT}`);
  console.log(`📁 Static files served from ${path.join(__dirname, '..')}`);
});
