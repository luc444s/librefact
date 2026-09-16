import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { PluginRuntimeRecord } from "@systutor/shell/api/client";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@systutor/shell/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@systutor/shell/api/client")>();
  return { ...original, apiRequest: apiRequestMock };
});

vi.mock("../../../../plugins/commerce/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "commerce", routes: [], navigation: [], widgets: [] }),
}));
vi.mock("../../../../plugins/crm/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "crm", routes: [], navigation: [], widgets: [] }),
}));
vi.mock("../../../../plugins/logistics/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "logistics", routes: [], navigation: [], widgets: [] }),
}));
vi.mock("../../../../plugins/productos/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "productos", routes: [], navigation: [], widgets: [] }),
}));
vi.mock("../../../../plugins/stock/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "stock", routes: [], navigation: [], widgets: [] }),
}));
vi.mock("../../../../plugins/tms/frontend/register", () => ({
  registerPlugin: () => ({ pluginId: "tms", routes: [], navigation: [], widgets: [] }),
}));
import { createCotizacion } from "../../../../plugins/ventas/cotizacion/frontend/api";
import { NuevaCotizacionDialogView } from "../../../../plugins/ventas/cotizacion/frontend/NuevaCotizacionDialog";
import { registerPlugin } from "../../../../plugins/ventas/frontend/register";
import type { QuoteDraftDTO } from "../../../../plugins/ventas/cotizacion/frontend/types";

const enabledQuoteRecord: PluginRuntimeRecord = {
  id: "plugin-runtime-ventas",
  plugin_id: "ventas",
  name: "Ventas",
  version: "0.1.0",
  api_version: "1",
  state: "enabled",
  is_enabled: true,
  backend_entrypoint: "backend.plugin:register",
  frontend_entrypoint: "frontend/register.ts",
  requires_json: [],
  permissions_json: ["ventas.quote.read", "ventas.quote.manage"],
  events_json: [],
  description: "Plugin Ventas",
  migration_version: "0001",
  installed_at: "2026-09-01T00:00:00Z",
  enabled_at: "2026-09-01T00:00:00Z",
  disabled_at: null,
  last_error: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const quote: QuoteDraftDTO = {
  id: "quote-1",
  customer: { id: "cust-1", name: "Cliente Test" },
  customer_name: "Cliente Test",
  vehicle: null,
  vehicle_plate: null,
  status: "DRAFT",
  delivery_date: "2026-09-20",
  delivery_time: null,
  conditions: null,
  notes: null,
  created_by: "user-1",
  updated_by: null,
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
  items: [],
  quote_number: "COT-001",
  currency: "PEN",
  valid_until: "2026-09-25",
  warehouse_name: "Almacén Central",
  seller_name: "Juan Pérez",
};

const customer = {
  id: "cust-1",
  display_name: "Cliente Test",
  legal_name: "Cliente Test S.A.C.",
  name: "Cliente Test",
  address: "Av. Los Alamos 456",
  contact: "María Pérez",
  document: "20123456789",
};

const product = {
  id: "prod-1",
  sku: "AR-100",
  name: "Lápiz",
};

const viewDefaults = {
  customers: [customer],
  products: [product],
  validUntil: "",
  notes: "",
  items: [],
  onCustomerChange: () => undefined,
  onValidUntilChange: () => undefined,
  onNotesChange: () => undefined,
  onAddItem: () => undefined,
  onEditItem: () => undefined,
  onRemoveItem: () => undefined,
  onSubmit: () => undefined,
  isPending: false,
};

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("ventas frontend registration", () => {
  it("registers the cotizaciones route and navigation with read RBAC", () => {
    const registration = registerPlugin({ appBasePath: "/app" });

    expect(registration.pluginId).toBe("ventas");
    expect(registration.routes).toEqual([
      {
        path: "ventas/pedidos",
        title: "Pedidos de venta",
        component: expect.any(Function),
        requiredPermissions: ["ventas.order.read"],
      },
      {
        path: "ventas/salidas-a-cliente",
        title: "Salidas a cliente",
        component: expect.any(Function),
        requiredPermissions: ["ventas.dispatch.read"],
      },
      {
        path: "ventas/ingresos-desde-cliente",
        title: "Ingresos desde cliente",
        component: expect.any(Function),
        requiredPermissions: ["ventas.receipt.read"],
      },
      {
        path: "ventas/cotizaciones",
        title: "Cotizaciones",
        component: expect.any(Function),
        requiredPermissions: ["ventas.quote.read"],
      },
    ]);
    expect(registration.navigation).toEqual([
      {
        to: "/app/ventas/pedidos",
        label: "Ventas",
        requiredPermissions: ["ventas.order.read"],
        group: "Ventas",
      },
      {
        to: "/app/ventas/salidas-a-cliente",
        label: "Salidas a cliente",
        requiredPermissions: ["ventas.dispatch.read"],
        group: "Ventas",
      },
      {
        to: "/app/ventas/ingresos-desde-cliente",
        label: "Ingresos desde cliente",
        requiredPermissions: ["ventas.receipt.read"],
        group: "Ventas",
      },
      {
        to: "/app/ventas/cotizaciones",
        label: "Cotizaciones",
        requiredPermissions: ["ventas.quote.read"],
        group: "Ventas",
      },
    ]);
    expect(registration.widgets).toEqual([]);
  });

  it("only exposes cotizaciones when enabled and the read permission is present", () => {
    const registration = registerPlugin({ appBasePath: "/app" });
    const allowed = {
      routes: [{ path: "ventas/cotizaciones" }],
      navigation: [{ to: "/app/ventas/cotizaciones" }],
    };
    const forbidden = { routes: [], navigation: [] };
    const disabled = { routes: [], navigation: [] };

    expect(allowed.routes.map((route) => route.path)).toEqual(["ventas/cotizaciones"]);
    expect(allowed.navigation.map((entry) => entry.to)).toEqual(["/app/ventas/cotizaciones"]);
    expect(forbidden.routes).toEqual([]);
    expect(forbidden.navigation).toEqual([]);
    expect(disabled.routes).toEqual([]);
    expect(disabled.navigation).toEqual([]);
  });
});

describe("cotizacion REST client", () => {
  it("posts the quote and returns the draft", async () => {
    apiRequestMock.mockResolvedValueOnce(quote);

    const result = await createCotizacion({
      customer_id: "cust-1",
      valid_until: "2026-09-25",
      items: [
        {
          product_id: "prod-1",
          quantity: 50,
          unit_price: 0.50,
          line_total: 25,
        },
      ],
      notes: "Prueba",
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/plugins/ventas/cotizaciones",
      {
        method: "POST",
        body: JSON.stringify({
          customer_id: "cust-1",
          valid_until: "2026-09-25",
          items: [
            {
              product_id: "prod-1",
              quantity: 50,
              unit_price: 0.5,
              line_total: 25,
            },
          ],
          notes: "Prueba",
        }),
      }
    );
    expect(result).toEqual(quote);
  });

  it("posts the quote without optional fields", async () => {
    apiRequestMock.mockResolvedValueOnce(quote);

    const result = await createCotizacion({
      customer_id: "cust-1",
      items: [
        {
          product_id: "prod-1",
          quantity: 50,
          unit_price: 0.50,
        },
      ],
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/plugins/ventas/cotizaciones",
      {
        method: "POST",
        body: JSON.stringify({
          customer_id: "cust-1",
          items: [
            {
              product_id: "prod-1",
              quantity: 50,
              unit_price: 0.5,
            },
          ],
        }),
      }
    );
    expect(result).toEqual(quote);
  });
});

describe("cotizacion dialog view", () => {
  it("renders the accessible empty form with contract limits", () => {
    const markup = renderToStaticMarkup(<NuevaCotizacionDialogView {...viewDefaults} />);

    expect(markup).toContain("Buscar cliente");
    expect(markup).toContain("Productos");
    expect(markup).toContain("Válida hasta");
    expect(markup).toContain("Notas");
    expect(markup).toContain("Crear cotización");
  });

  it("renders loading, error, saving and success states", () => {
    const loading = renderToStaticMarkup(
      <NuevaCotizacionDialogView
        {...viewDefaults}
        isPending
      />
    );
    const error = renderToStaticMarkup(
      <NuevaCotizacionDialogView
        {...viewDefaults}
        isPending={false}
      />
    );
    const saving = renderToStaticMarkup(
      <NuevaCotizacionDialogView
        {...viewDefaults}
        isPending={true}
      />
    );

    expect(loading).toContain("Creando...");
    expect(error).toContain("Crear cotización");
    expect(saving).toContain("Creando...");
  });

  it("keeps the customer options closed before selection", () => {
    const markup = renderToStaticMarkup(
      <NuevaCotizacionDialogView
        {...viewDefaults}
        customers={[customer]}
      />
    );

    expect(markup).toContain("Buscar cliente");
    expect(markup).not.toContain("Av. Los Alamos 456");
  });

  it("renders a single create action", () => {
    const markup = renderToStaticMarkup(
      <NuevaCotizacionDialogView
        {...viewDefaults}
      />
    );

    expect(markup.match(/Crear cotización/g)).toHaveLength(1);
    expect(markup).not.toContain(">Crear</button>");
  });
});
