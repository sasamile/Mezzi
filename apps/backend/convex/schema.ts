import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Planes del SaaS
  plans: defineTable({
    name: v.string(),
    price: v.number(), // precio mensual ($/mes)
    priceAnnual: v.optional(v.number()), // precio anual ($/año), si no existe se usa price*12
    createdAt: v.number(),
  }),

  // Restaurantes (tenants) del SaaS (slug opcional: solo para documentos antiguos, ya no se usa)
  tenants: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("trial"), v.literal("cancelled")),
    planId: v.optional(v.id("plans")),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** Correos para notificar cuando se crea una PQR (Brevo) */
    pqrNotificationEmails: v.optional(v.array(v.string())),
    /** Módulos habilitados por restaurante. undefined = todos habilitados (compatibilidad) */
    enabledModules: v.optional(
      v.object({
        pqr: v.optional(v.boolean()),
        pedidos: v.optional(v.boolean()),
        reservas: v.optional(v.boolean()),
        conocimiento: v.optional(v.boolean()),
        trabajaConNosotros: v.optional(v.boolean()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_status", ["status"]),

  // Usuarios del sistema (puedes enlazar después con Convex Auth)
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.optional(v.string()), // hash bcrypt para email/password
    isSuperadmin: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"]),

  // Relación usuario ↔ restaurante + rol + permisos por página
  userTenants: defineTable({
    userId: v.id("users"),
    tenantId: v.id("tenants"),
    role: v.union(
      v.literal("OWNER"),
      v.literal("ADMIN"),
      v.literal("AGENT"),
      v.literal("VIEWER")
    ),
    /** Páginas que puede ver. undefined = todas según rol. [] = ninguna. */
    allowedPages: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_tenant", ["tenantId"])
    .index("by_user_tenant", ["userId", "tenantId"]),

  // Integración YCloud por restaurante (webhook, credenciales)
  tenantIntegrations: defineTable({
    tenantId: v.id("tenants"),
    provider: v.literal("YCLOUD"),
    apiKey: v.optional(v.string()), // API Key de YCloud (Developers > API Keys) para enviar mensajes
    phoneNumber: v.optional(v.string()), // número WhatsApp/YCloud a conectar
    webhookSecret: v.optional(v.string()),
    webhookPath: v.string(), // ej: "tenant_xxx_yyyy" para construir URL
    connected: v.boolean(), // true solo cuando webhook recibe primer mensaje
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_provider", ["tenantId", "provider"]),

  // Conversaciones (inbox) por tenant
  conversations: defineTable({
    tenantId: v.id("tenants"),
    externalContactId: v.string(),
    customerName: v.string(),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("messenger"),
      v.literal("webchat")
    ),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("pending")
    ),
    threadId: v.optional(v.string()), // ID del thread del agente IA (RAG)
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent")
    )),
    assignedTo: v.optional(v.id("users")), // null/undefined = Bot IA, set = humano/agente
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()), // preview para lista tipo WhatsApp
    lastMessageDirection: v.optional(v.union(v.literal("INBOUND"), v.literal("OUTBOUND"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_last_message", ["tenantId", "lastMessageAt"])
    .index("by_tenant_contact", ["tenantId", "externalContactId"])
    .index("by_thread_id", ["threadId"]),

  // Mensajes de cada conversación
  messages: defineTable({
    conversationId: v.id("conversations"),
    tenantId: v.id("tenants"),
    direction: v.union(v.literal("INBOUND"), v.literal("OUTBOUND")),
    type: v.literal("TEXT"),
    content: v.string(),
    mediaUrl: v.optional(v.string()), // imagen o video
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("document"))),
    isBot: v.optional(v.boolean()), // true si fue enviado por IA
    providerMessageId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_tenant", ["tenantId"]),

  // Conocimiento por restaurante (texto manual o archivo subido)
  knowledgeItems: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    content: v.string(),
    storageId: v.optional(v.id("_storage")), // archivo subido (txt, md, pdf)
    tags: v.optional(v.array(v.string())),
    ragEntryId: v.optional(v.string()), // ID en RAG para indexar/buscar
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"]),

  // Deduplicación webhook YCloud (evita procesar mismo evento dos veces)
  ycloudProcessedEvents: defineTable({
    eventId: v.string(),
  }).index("by_event_id", ["eventId"]),

  // Permisos por rol (gestionado por superadmin)
  rolePermissions: defineTable({
    role: v.union(
      v.literal("OWNER"),
      v.literal("ADMIN"),
      v.literal("AGENT"),
      v.literal("VIEWER")
    ),
    module: v.string(),
    allowed: v.boolean(),
  })
    .index("by_role", ["role"]),

  // Prompts por restaurante
  tenantPrompts: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    prompt: v.string(),
    isDefault: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_default", ["tenantId", "isDefault"]),

  // Formulario personalizado por restaurante (para generar prompt desde respuestas)
  tenantFormConfig: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    fields: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        key: v.string(),
        type: v.union(v.literal("text"), v.literal("textarea")),
      })
    ),
    includeColorTheme: v.optional(v.boolean()), // si true, el form público muestra selector de colores + vista previa
    updatedAt: v.number(),
  }).index("by_tenant", ["tenantId"]),

  // Enlace público de un solo uso por restaurante
  tenantFormShare: defineTable({
    tenantId: v.id("tenants"),
    token: v.string(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_token", ["token"]),

  // Respuestas enviadas desde el formulario público
  formSubmissions: defineTable({
    tenantId: v.id("tenants"),
    token: v.string(),
    responses: v.string(), // JSON: { [key]: value }
    createdAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_created", ["tenantId", "createdAt"]),

  // Configuración de reservas por restaurante (límites, cupos, campos a pedir)
  reservationConfig: defineTable({
    tenantId: v.id("tenants"),
    maxReservationsPerDay: v.number(), // límite total de reservas por día
    maxVirtualPerDay: v.optional(v.number()), // cupo reservas virtuales (chat/WhatsApp) por día
    maxPresencialPerDay: v.optional(v.number()), // cupo reservas presenciales por día
    reservationFields: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        required: v.boolean(),
        type: v.union(v.literal("text"), v.literal("number"), v.literal("select")),
        options: v.optional(v.array(v.string())), // para tipo select (ej: mesas)
      })
    ),
    defaultDurationMinutes: v.optional(v.number()), // duración por defecto de reserva (min)
    updatedAt: v.number(),
  }).index("by_tenant", ["tenantId"]),

  // Reservas (desde chat o presenciales)
  reservations: defineTable({
    tenantId: v.id("tenants"),
    startTime: v.number(), // timestamp inicio
    endTime: v.number(), // timestamp fin
    customerName: v.string(),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    tableNumber: v.optional(v.string()), // mesa solicitada
    source: v.union(
      v.literal("virtual"), // desde chat/WhatsApp
      v.literal("presencial") // en local
    ),
    conversationId: v.optional(v.id("conversations")),
    status: v.union(
      v.literal("confirmed"),
      v.literal("pending"),
      v.literal("cancelled"),
      v.literal("completed"),
      v.literal("no_show") // cliente no se presentó
    ),
    confirmedAt: v.optional(v.number()), // timestamp llegada cliente
    noShowAt: v.optional(v.number()), // timestamp marcado no show
    extraData: v.optional(v.string()), // JSON con datos adicionales según reservationFields
    googleEventId: v.optional(v.string()), // ID del evento en Google Calendar
    importedFromGoogle: v.optional(v.boolean()), // true si vino de importación
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_date", ["tenantId", "startTime"])
    .index("by_conversation", ["conversationId"]),

  // Mesas del restaurante (layout mapa)
  tables: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(), // ej: "1", "Terraza-1"
    positionX: v.number(), // % o px en mapa
    positionY: v.number(),
    shape: v.union(v.literal("circle"), v.literal("rect")),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    capacity: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"]),

  // Actividad en vivo (feed)
  activityLog: defineTable({
    tenantId: v.id("tenants"),
    type: v.union(
      v.literal("arrival_confirmed"),
      v.literal("table_freed"),
      v.literal("reservation_created"),
      v.literal("no_show"),
      v.literal("table_reassigned")
    ),
    message: v.string(),
    reservationId: v.optional(v.id("reservations")),
    tableNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    data: v.optional(v.string()), // JSON extra
    createdAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_created", ["tenantId", "createdAt"]),

  // Pedidos (productos desde menú/base de conocimiento; al marcar "Enviado" se notifica por WhatsApp)
  requests: defineTable({
    tenantId: v.id("tenants"),
    distributorName: v.string(),
    items: v.string(), // JSON: [{ product, quantity, unit }] — productos del menú/base de conocimiento
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    address: v.optional(v.string()), // dirección de entrega
    recipientName: v.optional(v.string()), // quien recibe
    conversationId: v.optional(v.id("conversations")), // si el pedido vino del inbox, para enviar WhatsApp al despachar
    notes: v.optional(v.string()),
    requestedAt: v.number(),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_created", ["tenantId", "createdAt"])
    .index("by_conversation_created", ["conversationId", "createdAt"]),

  // PQRs - Peticiones, Quejas, Reclamos, Sugerencias, Felicitaciones
  pqrs: defineTable({
    tenantId: v.id("tenants"),
    type: v.union(
      v.literal("petition"),
      v.literal("complaint"),
      v.literal("claim"),
      v.literal("suggestion"),
      v.literal("compliment")
    ),
    customerName: v.string(), // "Anónimo" si es PQR anónima
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    subject: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
    source: v.optional(v.union(
      v.literal("whatsapp"),
      v.literal("web"),
      v.literal("presencial"),
      v.literal("email")
    )),
    assignedTo: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolutionNotes: v.optional(v.string()),
    ticketNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_created", ["tenantId", "createdAt"])
    .index("by_tenant_status", ["tenantId", "status"]),

  // Integración Google Calendar por restaurante (OAuth tokens)
  googleCalendarIntegrations: defineTable({
    tenantId: v.id("tenants"),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calendarId: v.optional(v.string()), // primary o ID de calendario específico
    connected: v.boolean(),
    expiresAt: v.optional(v.number()), // timestamp expiry del accessToken
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_tenant", ["tenantId"]),

  // Clientes (por tenant + teléfono); se alimenta de conversaciones y se usa en la IA
  customers: defineTable({
    tenantId: v.id("tenants"),
    externalContactId: v.string(), // ej. whatsapp:+573001234567
    name: v.string(),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    preferences: v.optional(v.string()), // preferencias alimenticias, etc.
    lastContactAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_contact", ["tenantId", "externalContactId"]),

  // Trabaja con nosotros: ubicaciones y vacantes
  jobLocations: defineTable({
    tenantId: v.id("tenants"),
    city: v.string(), // ej: Medellín, Bogotá, Barranquilla
    mallName: v.string(), // centro comercial / ubicación: Mayorca, Viva Envigado, Santa Fe, etc.
    isPrincipal: v.optional(v.boolean()), // true si es sede principal
    vacancies: v.array(v.string()), // ej: ["PARRILLERO", "MESERA", "CAJERO"]
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_city", ["tenantId", "city"]),

  // Uso diario del Centro de Aprendizaje (límite 2000 créditos/día por tenant)
  learningUsage: defineTable({
    tenantId: v.id("tenants"),
    date: v.string(), // "YYYY-MM-DD"
    count: v.number(),
    highConfidenceCount: v.number(), // respuestas con confianza alta
  })
    .index("by_tenant_date", ["tenantId", "date"]),
});
