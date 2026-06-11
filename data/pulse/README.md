# Pulse

Pulse is a web integration platform that keeps Shopify online stores in sync with the Khaos Control (KC) ERP system. It automates the flow of product data, stock levels, customer orders, and shipping updates between the two systems — eliminating manual data entry and ensuring both platforms always reflect the same information.

While Pulse is built primarily for Shopify and Khaos Control, it has been designed from the ground up to support additional e-commerce platforms (such as WooCommerce or Magento) in the future.

---

## What Pulse Does

Pulse handles four core integration flows:

### 1. Product Sync (KC → Shopify)
When products are created or updated in Khaos Control, Pulse automatically pushes those changes to Shopify. This includes product names, descriptions, prices, images, variants (e.g. size/colour combinations), and category assignments. Products marked as "published to web" in KC appear on Shopify; discontinued products are removed.

### 2. Inventory Sync (KC → Shopify)
Stock levels in Khaos Control are synced to Shopify every few minutes. When stock is received, sold through other channels, or adjusted in the warehouse, Shopify's available quantities update automatically. This prevents overselling and keeps the website accurate without anyone needing to manually update stock counts.

### 3. Order Import (Shopify → KC)
When a customer places an order on Shopify, Pulse sends that order into Khaos Control for fulfilment. It translates the Shopify order format into KC's expected format, including customer details, delivery address, payment information, and the items ordered. KC then processes the order through its normal warehouse workflow.

### 4. Order Fulfilment (KC → Shopify)
Once an order has been picked, packed, and shipped from the warehouse, Khaos Control records tracking numbers and courier details. Pulse picks up these updates and creates fulfilment records on Shopify, so customers receive shipping notifications with tracking links.

> **Price Updates** are planned as a future addition.

---

## How It Works

Pulse runs entirely on Amazon Web Services (AWS) and is built as a set of small, independent services that communicate through message queues. Here is a plain-language explanation of each part:

### The Dashboard
A web-based control panel where you can:
- See the status of all syncs at a glance (running, completed, or errored)
- Manually trigger a sync if needed
- Configure which Shopify stores are connected and how fields map between KC and Shopify
- Browse sync history and investigate errors
- Manage settings like courier name mappings and payment type mappings

Built with **Next.js** and **React** — modern web technologies that provide a fast, responsive user interface.

### The API
A backend service that the dashboard talks to. It handles requests like "show me the last 50 sync runs" or "trigger a product sync for Store X now." It reads from and writes to the database, and can publish messages to the queues to kick off sync jobs.

Built with **Hono.js**, a lightweight framework designed to run efficiently on AWS Lambda.

### The Workers
These are the engines that do the actual syncing. Each sync type (products, inventory, orders, fulfilment) has its own dedicated worker. Workers are triggered either on a schedule (e.g. every 5 minutes for inventory) or in response to events (e.g. a new Shopify order webhook). They:
1. Fetch data from the source system (KC or Shopify)
2. Transform it into the format the target system expects
3. Push it to the target system
4. Log the results

Workers run on **AWS Lambda** — serverless functions that only run (and cost money) when there is actual work to do.

### The Message Queues
Queues act as a buffer between the scheduler and the workers. When it is time for a sync to run, a message is placed on the appropriate queue. The worker picks it up and processes it. If the worker fails, the message becomes visible again for retry. After multiple failures, the message moves to a "dead letter queue" for investigation.

Built with **Amazon SQS** (Simple Queue Service). There are four queues — one for each sync type — each with its own dead letter queue for failed messages.

### The Scheduler
An automated timer that triggers syncs at regular intervals:
- **Product sync**: every 30 minutes
- **Inventory sync**: every 5 minutes (stock levels are time-sensitive)
- **Order fulfilment sync**: every 10 minutes
- **Order import**: primarily driven by Shopify webhooks (instant), with a 10-minute backup poll

Built with **Amazon EventBridge**, a managed scheduling service.

### The Database
Stores all configuration and state:
- Which Shopify stores are connected, and to which KC instance
- How fields should be mapped between systems (e.g. KC's "STOCK_DESC" → Shopify's "Product Title")
- The ID relationships between KC and Shopify (e.g. KC stock code "BM101" = Shopify product ID "12345")
- A history of every sync run — what was processed, what succeeded, and what failed
- The current state of every order flowing between the two systems

Built with **PostgreSQL** on **Amazon RDS** — a reliable, industry-standard relational database.

### The XML Archive
Every time Pulse fetches data from Khaos Control, the raw XML response is saved to cloud storage. This provides a complete audit trail and makes it easy to investigate issues — you can see exactly what KC sent at any point in time.

Built with **Amazon S3** (Simple Storage Service).

### The KC Connector
Khaos Control exposes its data through a SOAP web service that communicates using XML. Pulse includes a dedicated client that:
- Connects to the KC SOAP endpoint
- Calls the appropriate methods (ExportStock, ExportStockStatus, ImportOrders, ExportOrderStatusEx, ExportWebCat)
- Parses the XML responses into structured data that the rest of the system can work with
- Builds XML requests for importing orders back into KC

### The Platform Abstraction Layer
Rather than coding directly against Shopify's API everywhere, Pulse defines a standard interface that any e-commerce platform can implement. The Shopify adapter translates this standard interface into Shopify GraphQL API calls. In the future, a WooCommerce adapter (or any other) could be added without changing any of the sync engine logic.

### The Field Mapping Engine
Different systems call things by different names and store data in different formats. The mapping engine translates between them — for example, converting KC's "STOCK_DESC" field into Shopify's "Product Title", or truncating an address line to fit KC's 35-character limit. Mappings are configurable per store through the dashboard.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript | Single language across the entire stack |
| Monorepo | Turborepo + pnpm | Manages multiple packages in one repository |
| Infrastructure | SST v3 (Ion) | Defines all AWS resources as code |
| API | Hono.js on AWS Lambda | Lightweight, serverless API |
| Database | PostgreSQL on Amazon RDS | Relational data storage |
| ORM | Drizzle ORM | Type-safe database queries |
| Queues | Amazon SQS | Reliable message queuing |
| Scheduling | Amazon EventBridge | Cron-based sync triggers |
| Storage | Amazon S3 | XML archive and audit trail |
| Auth | Amazon Cognito | Dashboard user authentication |
| Dashboard | Next.js + React | Web-based monitoring UI |
| UI Components | shadcn/ui + Tailwind CSS | Dashboard interface components |
| KC Integration | SOAP/XML via node-soap | Khaos Control API communication |
| Shopify Integration | GraphQL Admin API | Shopify API communication |
| Validation | Zod | Runtime data validation |

---

## Project Structure

```
pulse/
├── packages/
│   ├── core/           Shared business logic (KC client, Shopify adapter,
│   │                   database schema, field mappings, sync engines, utilities)
│   ├── api/            REST API for the dashboard (store management,
│   │                   sync monitoring, log viewing)
│   ├── workers/        Sync worker Lambda functions (one per sync type
│   │                   plus a scheduler)
│   └── dashboard/      Next.js web dashboard (future)
├── infra/              AWS infrastructure definitions (future, currently in sst.config.ts)
├── sst.config.ts       SST v3 infrastructure-as-code entry point
└── ARCHITECTURE.md     Detailed technical architecture plan
```

---

## Getting Started

### Prerequisites
- Node.js 22+
- pnpm 10+
- AWS account with credentials configured
- SST CLI (`npx sst`)

### Install and Build
```bash
pnpm install
pnpm build
```

### Development
```bash
npx sst dev
```

This starts the SST development environment with live Lambda debugging against real AWS resources.

---

## Khaos Control Integration Pack

The `KhaosControl WebIntegrationPack_v7.8k/` directory contains the official KC Web Integration Pack documentation, including XML schema examples for all supported data types. This serves as the reference for the KC connector implementation.
