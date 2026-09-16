import type { PluginFrontendContext, PluginFrontendRegistration } from "@systutor/sdk/frontend";

import { SalesOrdersPage } from "./pages/SalesOrdersPage";
import { CotizacionesPage } from "./pages/CotizacionesPage";

export function registerPlugin(ctx: PluginFrontendContext): PluginFrontendRegistration {
  return {
    pluginId: "ventas",
    routes: [
      {
        path: "ventas/pedidos",
        title: "Pedidos de venta",
        component: SalesOrdersPage,
        requiredPermissions: ["ventas.order.read"],
      },
      {
        path: "ventas/cotizaciones",
        title: "Cotizaciones",
        component: CotizacionesPage,
        requiredPermissions: ["ventas.quote.read"],
      },
    ],
    navigation: [
      {
        to: `${ctx.appBasePath}/ventas/pedidos`,
        label: "Ventas",
        requiredPermissions: ["ventas.order.read"],
        group: "Ventas",
      },
      {
        to: `${ctx.appBasePath}/ventas/cotizaciones`,
        label: "Cotizaciones",
        requiredPermissions: ["ventas.quote.read"],
        group: "Ventas",
      },
    ],
    widgets: [],
  };
}
