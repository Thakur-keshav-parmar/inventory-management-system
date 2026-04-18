# Inventory Management System

A full-stack inventory and POS (Point of Sale) management system for hardware stores. Built with vanilla JS frontend deployed on AWS CloudFront + S3, powered by AWS Lambda + DynamoDB backend.

## Features

- Multi-role access: Admin, Manager, Staff, Delivery, Customer
- Product inventory with expiry tracking and low-stock alerts
- Billing & GST invoice generation with WhatsApp receipt sharing
- Delivery management with real-time route mapping (OSRM + OpenStreetMap)
- OTP-verified delivery confirmation via WhatsApp
- Analytics dashboard with charts (Chart.js)
- Dark / Light theme toggle
- Razorpay payment integration

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| CDN | AWS CloudFront |
| Storage | AWS S3 |
| API | AWS API Gateway |
| Backend | AWS Lambda (Node.js, ARM64) |
| Database | AWS DynamoDB (On-Demand) |
| Messaging | Twilio WhatsApp API |
| Payments | Razorpay |
| Maps | OpenStreetMap + OSRM |

## Project Structure

```
inventory-management-system/
├── frontend/
│   └── index.html              # Main SPA application
├── backend/
│   └── lambdas/
│       ├── products/           # Product CRUD + S3 image upload
│       ├── bills/              # Bills/transactions with date filtering
│       ├── users/              # User management (passwords hashed)
│       ├── settings/           # Store settings
│       ├── sendWhatsApp/       # Twilio WhatsApp messaging
│       ├── createOrder/        # Razorpay order creation
│       └── confirmPayment/     # Razorpay payment verification
├── infrastructure/
│   └── template.yaml           # AWS CloudFormation template
├── scripts/
│   ├── seed_products.py        # Seed sample products to DynamoDB
│   ├── inject_api.py           # Inject API URL into HTML
│   └── deploy.sh               # One-command deployment script
├── docs/
│   └── DEPLOYMENT_GUIDE.md    # Step-by-step AWS setup guide
├── config.example.js           # Configuration template (copy → config.js)
└── .gitignore
```

## Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/Thakur-keshav-parmar/inventory-management-system.git
cd inventory-management-system
```

### 2. Configure your credentials
```bash
cp config.example.js config.js
# Edit config.js and fill in your AWS API Gateway URL and Razorpay Key
```

### 3. Deploy AWS infrastructure
```bash
aws cloudformation deploy \
  --template-file infrastructure/template.yaml \
  --stack-name InventoryManagement \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    RazorpayKeyId=YOUR_RAZORPAY_KEY_ID \
    RazorpayKeySecret=YOUR_RAZORPAY_KEY_SECRET \
    TwilioAccountSid=YOUR_TWILIO_SID \
    TwilioAuthToken=YOUR_TWILIO_TOKEN \
    TwilioWhatsAppFrom=whatsapp:+14155238886
```

### 4. Deploy frontend
```bash
aws s3 cp frontend/index.html s3://YOUR_BUCKET_NAME/ \
  --content-type text/html \
  --cache-control "no-cache, no-store, must-revalidate"
```

## Default Login

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Admin |
| staff | staff123 | Staff |
| customer | 123 | Customer |

> **Note:** Change all default passwords immediately after first login.

## Security Features

- SHA-256 password hashing (Web Crypto API)
- Cryptographically secure OTP generation
- Login rate limiting (5 attempts → 5 min lockout)
- 30-minute session timeout on inactivity
- CORS restricted to CloudFront domain only
- Input validation on all Lambda endpoints
- Request body size limits on all APIs
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options
- Passwords never stored or returned in plaintext

## License

MIT
