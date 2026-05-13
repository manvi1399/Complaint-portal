# Architecture & Technical Guide

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser (User)                  │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    ┌───▼────┐          ┌──▼──────┐
    │ Vite   │          │ Express │
    │ React  │◄────────►│ Server  │
    │ Dev    │          │(Backend)│
    └────────┘          └──┬──────┘
                           │
                ┌──────────┬┴─────────┐
                │          │         │
            ┌───▼──┐  ┌───▼───┐  ┌──▼──┐
            │ JSON │  │Google │  │Resend
            │Files │  │Gemini │  │API
            └──────┘  └───────┘  └─────┘
                (or MongoDB)
```

## Portal Architecture

### Multi-Portal Setup
- **Citizen Portal** (Port 3000): File complaints, track status
- **Admin Portal** (Port 3001): Dashboard, routing, management
- **Block Portals** (Ports 3002, 3003): Operator interfaces
- All portals share same Express backend

### Frontend Stack
- **React 19**: UI components and state management
- **Vite**: Fast build and dev server
- **TailwindCSS**: Responsive styling
- **TypeScript**: Type safety

### Backend Stack
- **Express.js**: HTTP server and routing
- **bcryptjs**: Password hashing
- **Nodemailer**: SMTP email (fallback)
- **Resend**: Modern email API

## Data Flow

### Complaint Lifecycle

```
1. Citizen Files Complaint
   ↓
2. Gemini AI Classifies & Routes
   ↓
3. Admin Reviews Manual Queue (if needed)
   ↓
4. Admin Routes to Block
   ↓
5. Block Operator Updates Progress
   ↓
6. Citizen Sees Updates in Real-time
   ↓
7. Marked as Resolved
```

### OTP Authentication Flow

```
1. User Enters Email
   ↓
2. Server Generates 6-digit OTP
   ↓
3. Resend API Sends Email
   ↓
4. User Enters OTP in UI
   ↓
5. Server Validates OTP (5 min expiry)
   ↓
6. Session Token Issued
```

## Database Schema

### Complaints Collection
```typescript
interface ComplaintRecord {
  id: string;                    // Unique ID
  text: string;                  // Complaint description
  severity: "critical" | ...;    // Auto-classified
  category: string;              // AI-determined category
  status: ComplaintStatus;       // Workflow status
  citizenId: string;             // Filed by
  blockId?: string;              // Assigned to
  remarks: ComplaintRemark[];    // History
  createdAt: string;             // Timestamp
  updatedAt: string;
  resolvedAt?: string;
  workDone: boolean;
}
```

## API Response Format

### Success
```json
{
  "data": {
    "id": "...",
    "text": "..."
  }
}
```

### Error
```json
{
  "error": "Descriptive error message"
}
```

## Environment Configuration

### Email Providers (Priority Order)
1. **SMTP** (if configured)
2. **Resend API** (if RESEND_API_KEY set)
3. **Demo Mode** (shows OTP in UI)

### Database Options
- **MongoDB Atlas**: Production (persistent)
- **JSON Files**: Development (ephemeral)

## Performance Considerations

- **Frontend Rendering**: ~100ms with Vite
- **API Response Time**: ~50-200ms
- **Email Delivery**: ~1-2 seconds (Resend)
- **AI Classification**: ~500ms-1s (Gemini)

## Security Implementation

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | OTP + Session tokens |
| **Authorization** | Role-based (Admin, Citizen, Operator) |
| **Data Protection** | Password hashing (bcryptjs) |
| **Rate Limiting** | OTP (5/min), Login (10/min) |
| **Input Validation** | Sanitization on all endpoints |
| **Secrets** | .env variables, not in code |

## Deployment Topology

### Local Development
```
Single server, all portals on different ports
```

### Vercel Production
```
Single deployment, ports managed by serverless
environment variables in dashboard
```

### MongoDB Setup (Production)
```
Connection pooling, automatic backups,
geographically distributed replicas
```

## Monitoring & Logging

### Health Endpoints
- `GET /health` - Server status
- `GET /api/auth/admin` - Admin auth check

### Logging Strategy
- `console.log()` for info in development
- Server startup logs include config summary
- Error stack traces in dev mode

## Scaling Considerations

- **Horizontal**: Use MongoDB for shared state
- **Vertical**: Increase server resources
- **Caching**: Add Redis for session/OTP storage
- **CDN**: CloudFlare for static assets
