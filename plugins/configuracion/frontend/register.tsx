import type { PluginFrontendContext, PluginFrontendRegistration } from "@systutor/sdk/frontend";

import { DocumentSeriesPage } from "./pages/DocumentSeriesPage";

export function registerPlugin(ctx: PluginFrontendContext): PluginFrontendRegistration {
  return {
    pluginId: "configuracion",
    routes: [
      {
        path: "configuracion/facturacion/series",
        title: "Series y correlativos",
        component: DocumentSeriesPage,
        requiredPermissions: ["configuracion.document_series.read"],
      },
    ],
    navigation: [
      {
        to: `${ctx.appBasePath}/configuracion/facturacion/series`,
        label: "Series y correlativos",
        group: "Configuración",
        requiredPermissions: ["configuracion.document_series.read"],
      },
    ],
    widgets: [],
  };
}
