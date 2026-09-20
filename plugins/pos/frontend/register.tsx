import type { PluginFrontendContext, PluginFrontendRegistration } from "@systutor/sdk/frontend";

import { PosPage } from "./pages/PosPage";

export function registerPlugin(ctx: PluginFrontendContext): PluginFrontendRegistration {
  return {
    pluginId: "pos",
    routes: [
      {
        path: "pos",
        title: "POS Bodega",
        component: PosPage,
        requiredPermissions: ["pos.session.read"],
      },
    ],
    navigation: [
      {
        to: `${ctx.appBasePath}/pos`,
        label: "POS",
        requiredPermissions: ["pos.session.read"],
        group: "Caja",
      },
    ],
    widgets: [],
  };
}
