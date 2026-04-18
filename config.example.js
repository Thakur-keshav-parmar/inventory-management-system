/**
 * HardwarePro - Configuration Template
 * 
 * HOW TO USE:
 * 1. Copy this file and rename it to: config.js
 * 2. Fill in your actual values below
 * 3. NEVER commit config.js to GitHub (it's in .gitignore)
 * 
 * In index.html, find AWS_CONFIG and replace with your values.
 */

const AWS_CONFIG = {
    useCloud: false,                        // Set to true to enable AWS cloud sync
    apiEndpoint: 'YOUR_API_GATEWAY_URL',    // From outputs.json after deploying CloudFormation
    razorpayKeyId: 'YOUR_RAZORPAY_KEY_ID'  // From Razorpay Dashboard > API Keys
};

/**
 * HOW TO DEPLOY ON AWS (One-time setup):
 * 
 * 1. Install AWS CLI: https://aws.amazon.com/cli/
 * 2. Run: aws configure  (enter your Access Key + Secret Key)
 * 3. Deploy CloudFormation stack:
 *    aws cloudformation deploy --template-file infrastructure/template.yaml --stack-name HardwarePro --capabilities CAPABILITY_NAMED_IAM --parameter-overrides RazorpayKeyId=YOUR_KEY RazorpayKeySecret=YOUR_SECRET TwilioAccountSid=YOUR_SID TwilioAuthToken=YOUR_TOKEN TwilioWhatsAppFrom=whatsapp:+YOUR_NUMBER
 * 4. Get your URLs from outputs.json after deployment
 * 5. Upload frontend:
 *    aws s3 cp index.html s3://YOUR_BUCKET_NAME/ --content-type text/html --cache-control "no-cache"
 */
