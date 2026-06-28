# Mahalaxmi Fashion Hub — Next.js + .NET + PostgreSQL

> PHP/MySQL se convert kiya gaya | Modern full-stack e-commerce platform

## 📁 Project Structure

```
mahalaxmi-nextjs-dotnet/
├── frontend/          # Next.js 14 (App Router + TypeScript + Tailwind CSS)
├── backend/           # .NET 8 Web API (C# + Entity Framework Core)
├── database/          # PostgreSQL schema SQL
├── docker-compose.yml # Docker Compose (one-command deploy)
└── .env.example       # Environment variables template
```

## 🚀 Quick Start (Docker — Recommended)

```bash
# 1. Copy env file and fill values
cp .env.example .env
nano .env   # Set DB_PASSWORD, JWT_KEY, admin credentials, Razorpay keys

# 2. Start everything
docker-compose up -d

# Frontend → http://localhost:3000
# Backend API → http://localhost:5000
# Swagger Docs → http://localhost:5000/swagger
# Admin Panel → http://localhost:3000/admin/login
```

## 🛠️ Local Development

### Backend (.NET 8)

```bash
cd backend

# Install tools
dotnet restore

# Set up appsettings.Development.json (copy from appsettings.json, fill values)

# Run database migrations + start server
dotnet ef migrations add InitialCreate
dotnet ef database update
dotnet run
# API runs at → http://localhost:5000
# Swagger → http://localhost:5000/swagger
```

### Frontend (Next.js)

```bash
cd frontend

# Install packages
npm install

# Copy and edit env
cp .env.local.example .env.local
# Edit NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Start dev server
npm run dev
# Runs at → http://localhost:3000
```

### Database (PostgreSQL)

```bash
# Using psql
psql -U postgres -c "CREATE DATABASE mahalaxmi_fashionhub;"
psql -U postgres -d mahalaxmi_fashionhub -f database/schema.sql
```

## 🔐 Admin Setup

1. Generate a BCrypt hash for your admin password:
   ```bash
   # Online: https://bcrypt-generator.com (use cost 12)
   # Or Node.js:
   node -e "const b=require('bcryptjs'); console.log(b.hashSync('YourPassword', 12));"
   ```
2. Set in `backend/appsettings.json`:
   ```json
   "Admin": {
     "Email": "admin@mahalaxmifashionhub.com",
     "PasswordHash": "$2a$12$..."
   }
   ```
3. Login at `http://localhost:3000/admin/login`

## 📦 What's Included

### Frontend Pages
| Page | Route |
|------|-------|
| Home | `/` |
| Products (All/Filtered) | `/products` |
| Product Detail | `/products/[id]` |
| Cart | `/cart` |
| Checkout (COD + Razorpay) | `/checkout` |
| Customer Account/Login | `/account` |
| Admin Dashboard | `/admin` |
| Admin Products | `/admin/products` |
| Admin Orders | `/admin/orders` |
| Admin Customers | `/admin/customers` |
| Admin Reports + GST | `/admin/reports` |
| Admin Login | `/admin/login` |

### Backend API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (filter by category, bestSeller) |
| GET | `/api/products/{id}` | Get product by ID |
| POST | `/api/products` | Bulk replace products (Admin) |
| PUT | `/api/products/{id}` | Update product (Admin) |
| DELETE | `/api/products/{id}` | Delete product (Admin) |
| GET | `/api/orders` | Get orders (Admin = all, Customer = filtered) |
| POST | `/api/orders` | Place order |
| PATCH | `/api/orders/status` | Update order status (Admin) |
| POST | `/api/customers/register` | Register customer |
| POST | `/api/customers/login` | Email/password login |
| POST | `/api/customers/send-otp` | Send WhatsApp OTP |
| POST | `/api/customers/verify-otp` | Verify OTP |
| POST | `/api/auth/admin-login` | Admin login |
| POST | `/api/payments/create-order` | Create Razorpay order |
| POST | `/api/payments/verify` | Verify Razorpay payment |
| GET | `/api/settings` | Get site settings |
| PUT | `/api/settings/{key}` | Update setting (Admin) |

## 🔄 Migration from PHP/MySQL

| Old (PHP/MySQL) | New (Next.js/.NET/PostgreSQL) |
|-----------------|-------------------------------|
| `products.php` | `ProductsController.cs` + `app/(store)/products/` |
| `orders.php` | `OrdersController.cs` + `app/(store)/checkout/` |
| `customers.php` | `CustomersController.cs` + `app/(store)/account/` |
| `razorpay.php` | `PaymentsController.cs` |
| `settings.php` | `SettingsController.cs` + `app/(admin)/admin/` |
| `admin-auth.php` | `AuthController.cs` + JWT |
| `customer-otp.php` | `CustomersController.cs` (SendOtp/VerifyOtp) |
| MySQL tables | PostgreSQL with JSONB + triggers |
| PHP sessions | JWT Bearer tokens |

## 🌐 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: .NET 8, ASP.NET Core Web API, Entity Framework Core
- **Database**: PostgreSQL 16, JSONB columns, Auto-updated timestamps
- **Auth**: JWT Bearer tokens, BCrypt password hashing
- **Payments**: Razorpay (UPI, Cards, Net Banking) + HMAC-SHA256 verification
- **Deployment**: Docker + Docker Compose

## 📧 Support

Contact: contact@mahalaxmifashionhub.com
