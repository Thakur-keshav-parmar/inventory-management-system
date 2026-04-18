"""
HardwarePro - Dummy Product Seeder
Downloads product images → uploads to S3 → posts products via API
"""

import boto3, requests, json, uuid, time
from botocore.config import Config

# ── AWS / API Config ────────────────────────────────────────────────────────
AWS_ACCESS_KEY    = "YOUR_AWS_ACCESS_KEY"         # Get from AWS IAM Console
AWS_SECRET_KEY    = "YOUR_AWS_SECRET_KEY"         # Get from AWS IAM Console
AWS_REGION        = "us-east-1"                   # Your AWS region
S3_BUCKET         = "your-frontend-bucket-name"   # Your S3 bucket name
CLOUDFRONT_URL    = "https://YOUR_CLOUDFRONT_ID.cloudfront.net"
API_BASE          = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod"

# ── S3 Client ───────────────────────────────────────────────────────────────
s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION,
    config=Config(signature_version="s3v4"),
)

# ── 14 Dummy Products (5 categories) ────────────────────────────────────────
# Images: royalty-free Unsplash direct links (stable photo IDs)
PRODUCTS = [
    # ── Power Tools (3) ─────────────────────────────────────────────────────
    {
        "name": "Circular Saw 185mm 1200W",
        "category": "Power Tools",
        "cost": 2800, "price": 3999, "stock": 12,
        "barcode": "PT2001",
        "img_url": "https://images.unsplash.com/photo-1590534247854-e97d5e3feef6?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Impact Wrench 1/2\" Drive",
        "category": "Power Tools",
        "cost": 3200, "price": 4599, "stock": 8,
        "barcode": "PT2002",
        "img_url": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Random Orbital Sander 150mm",
        "category": "Power Tools",
        "cost": 1500, "price": 2199, "stock": 22,
        "barcode": "PT2003",
        "img_url": "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&h=400&fit=crop&auto=format",
    },

    # ── Paints (3) ──────────────────────────────────────────────────────────
    {
        "name": "Nerolac Weather Coat 4L",
        "category": "Paints",
        "cost": 920, "price": 1399, "stock": 30,
        "barcode": "PA3001",
        "img_url": "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Black Enamel Paint 1L",
        "category": "Paints",
        "cost": 240, "price": 399, "stock": 55,
        "barcode": "PA3002",
        "img_url": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Texture Paint 5kg",
        "category": "Paints",
        "cost": 750, "price": 1099, "stock": 28,
        "barcode": "PA3003",
        "img_url": "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=400&fit=crop&auto=format",
    },

    # ── Plumbing (3) ────────────────────────────────────────────────────────
    {
        "name": "Flexible Braided Hose 1m",
        "category": "Plumbing",
        "cost": 120, "price": 220, "stock": 75,
        "barcode": "PL4001",
        "img_url": "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "CPVC Elbow Joint 1\"",
        "category": "Plumbing",
        "cost": 25, "price": 55, "stock": 300,
        "barcode": "PL4002",
        "img_url": "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Water Tank Float Valve",
        "category": "Plumbing",
        "cost": 95, "price": 175, "stock": 60,
        "barcode": "PL4003",
        "img_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=400&fit=crop&auto=format",
    },

    # ── Wood Work (3) ───────────────────────────────────────────────────────
    {
        "name": "MDF Board 12mm 8x4ft",
        "category": "Wood Work",
        "cost": 850, "price": 1299, "stock": 20,
        "barcode": "WW5001",
        "img_url": "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Carpenter Wood Glue 500ml",
        "category": "Wood Work",
        "cost": 160, "price": 280, "stock": 50,
        "barcode": "WW5002",
        "img_url": "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Sandpaper 80 Grit (Pack of 10)",
        "category": "Wood Work",
        "cost": 55, "price": 99, "stock": 120,
        "barcode": "WW5003",
        "img_url": "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop&auto=format",
    },

    # ── Other (2) ───────────────────────────────────────────────────────────
    {
        "name": "Safety Goggles Anti-Fog",
        "category": "Other",
        "cost": 90, "price": 169, "stock": 80,
        "barcode": "OT6001",
        "img_url": "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=400&h=400&fit=crop&auto=format",
    },
    {
        "name": "Steel Measuring Tape 5m",
        "category": "Other",
        "cost": 120, "price": 199, "stock": 65,
        "barcode": "OT6002",
        "img_url": "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400&h=400&fit=crop&auto=format",
    },
]


def upload_image_to_s3(img_url: str, key: str) -> str:
    """Download image from URL and upload to S3. Returns public CloudFront URL."""
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = requests.get(img_url, headers=headers, timeout=15)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=resp.content,
        ContentType=content_type,
    )
    return f"{CLOUDFRONT_URL}/{key}"


def post_product(product: dict):
    """POST product to the HardwarePro API."""
    resp = requests.post(
        f"{API_BASE}/products",
        json=product,
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    return resp.status_code, resp.text


def main():
    print("=" * 60)
    print("  HardwarePro – Dummy Product Seeder")
    print("=" * 60)

    for idx, p in enumerate(PRODUCTS, start=1):
        barcode = p["barcode"]
        product_id = f"SEED-{barcode}"

        # 1. Upload image to S3
        s3_key = f"products/images/{barcode}.jpg"
        print(f"\n[{idx:02d}/{len(PRODUCTS)}] {p['name']}")
        print(f"       Uploading image -> s3://{S3_BUCKET}/{s3_key}")

        try:
            public_url = upload_image_to_s3(p["img_url"], s3_key)
            print(f"       Image URL : {public_url}")
        except Exception as e:
            print(f"       WARN Image upload failed: {e}  - using empty string")
            public_url = ""

        # 2. Build product payload (matches HardwarePro schema)
        payload = {
            "productId": product_id,
            "id":        product_id,
            "name":      p["name"],
            "category":  p["category"],
            "cost":      p["cost"],
            "price":     p["price"],
            "stock":     p["stock"],
            "barcode":   barcode,
            "image":     public_url,
        }

        # 3. POST to API
        print(f"       Posting to API …")
        try:
            status, body = post_product(payload)
            if status in (200, 201):
                print(f"       OK Created  (HTTP {status})")
            else:
                print(f"       FAIL API returned HTTP {status}: {body[:120]}")
        except Exception as e:
            print(f"       FAIL API call failed: {e}")

        time.sleep(0.4)   # gentle rate-limit

    print("\n" + "=" * 60)
    print("  Done! Check HardwarePro Inventory panel.")
    print("=" * 60)


if __name__ == "__main__":
    main()
