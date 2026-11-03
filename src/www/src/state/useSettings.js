import { useEffect, useState } from "react";
import { api } from "../api/client";

const initial = {
  uiTrafficStats: false,
  uiChartType: 0,
  oneTimeLinks: false,
  sortClients: false,
  avatarSettings: { dicebear: null, gravatar: false },
};
const truthy = (value) => value === true || value === "true";
export function useSettings() {
  const [settings, setSettings] = useState(initial);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.getUiTrafficStats().catch(() => false),
      api.getUiChartType().catch(() => 0),
      api.getOneTimeLinksEnabled().catch(() => false),
      api.getSortClientsEnabled().catch(() => false),
      api.getAvatarSettings().catch(() => initial.avatarSettings),
    ]).then(([stats, chart, links, sort, avatars]) => {
      if (active)
        setSettings({
          uiTrafficStats: truthy(stats),
          uiChartType: Number(chart) || 0,
          oneTimeLinks: truthy(links),
          sortClients: truthy(sort),
          avatarSettings: avatars,
        });
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
