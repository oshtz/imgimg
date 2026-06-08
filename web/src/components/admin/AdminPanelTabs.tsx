import {
  TbKey,
  TbFileCode,
  TbPuzzle,
  TbPhoto,
  TbClock,
  TbCategory,
  TbAdjustments
} from "react-icons/tb";

export type AdminTab =
  | "api-keys"
  | "workflows"
  | "asset-types"
  | "loras"
  | "presets"
  | "history"
  | "preferences";

interface TabConfig {
  id: AdminTab;
  label: string;
  icon: typeof TbKey;
}

const tabs: TabConfig[] = [
  { id: "api-keys", label: "API Keys", icon: TbKey },
  { id: "workflows", label: "Workflows", icon: TbFileCode },
  { id: "asset-types", label: "Types", icon: TbCategory },
  { id: "loras", label: "LoRAs", icon: TbPuzzle },
  { id: "presets", label: "Presets", icon: TbPhoto },
  { id: "history", label: "History", icon: TbClock },
  { id: "preferences", label: "Preferences", icon: TbAdjustments },
];

interface AdminPanelTabsProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

export function AdminPanelTabs({ activeTab, onTabChange }: AdminPanelTabsProps) {
  return (
    <div className="flex items-center justify-center">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
              "border-b-2 -mb-[1px]",
              isActive
                ? "border-zinc-500 text-zinc-600 dark:text-zinc-500"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
