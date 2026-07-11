import { useCallback, useEffect, useState } from "react";
import {
  getWorkflows,
  getAssetTypes,
  getWorkflowPreviews,
  pinWorkflow,
  unpinWorkflow,
  saveWorkflowOrganization,
  createWorkflowFolder,
  renameWorkflowFolder,
  deleteWorkflowFolder,
  type WorkflowSummary,
  type ApiBaseUrl,
  type ProviderStatus,
  type WorkflowOrganization,
  type WorkflowOrderItem,
  type WorkflowFolder,
} from "../client";
import { AssetTypeRegistry, EMPTY_REGISTRY } from "../assetTypeRegistry";

export function useWorkflowManager(apiBaseUrl: ApiBaseUrl) {
  const [workflowsRemote, setWorkflowsRemote] = useState<WorkflowSummary[]>([]);
  const [pinnedWorkflowIds, setPinnedWorkflowIds] = useState<string[]>([]);
  const [workflowOrg, setWorkflowOrg] = useState<WorkflowOrganization | null>(null);
  const [workflowPreviewsFromApi, setWorkflowPreviewsFromApi] = useState<Record<string, string>>({});
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [assetTypeRegistry, setAssetTypeRegistry] = useState<AssetTypeRegistry>(EMPTY_REGISTRY);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const refreshWorkflows = useCallback(async () => {
    try {
      const result = await getWorkflows(apiBaseUrl);
      setWorkflowError(null);
      setWorkflowsRemote(result.workflows);
      setPinnedWorkflowIds(result.pinnedWorkflowIds);
      setWorkflowOrg(result.organization);
      if (result.providerStatus) {
        setProviderStatus(result.providerStatus);
      }
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "Could not load workflows");
    }
  }, [apiBaseUrl]);

  const refreshAssetTypes = useCallback(async () => {
    try {
      const types = await getAssetTypes(apiBaseUrl);
      setAssetTypeRegistry(new AssetTypeRegistry(types));
    } catch {
      // Keep existing registry on error
    }
  }, [apiBaseUrl]);

  const refreshWorkflowPreviews = useCallback(async () => {
    try {
      const previews = await getWorkflowPreviews(apiBaseUrl);
      setWorkflowPreviewsFromApi(previews);
    } catch {
      // Non-critical, ignore errors
    }
  }, [apiBaseUrl]);

  const handleTogglePin = useCallback(async (workflowId: string) => {
    const isPinned = pinnedWorkflowIds.includes(workflowId);
    if (isPinned) {
      setPinnedWorkflowIds((prev) => prev.filter((id) => id !== workflowId));
    } else {
      setPinnedWorkflowIds((prev) => [...prev, workflowId]);
    }
    try {
      if (isPinned) {
        await unpinWorkflow(apiBaseUrl, workflowId);
      } else {
        await pinWorkflow(apiBaseUrl, workflowId);
      }
    } catch {
      if (isPinned) {
        setPinnedWorkflowIds((prev) => [...prev, workflowId]);
      } else {
        setPinnedWorkflowIds((prev) => prev.filter((id) => id !== workflowId));
      }
    }
  }, [apiBaseUrl, pinnedWorkflowIds]);

  const handleReorderWorkflows = useCallback(async (items: WorkflowOrderItem[]) => {
    setWorkflowOrg((prev) => prev ? { ...prev, items } : { folders: [], items });
    try {
      await saveWorkflowOrganization(apiBaseUrl, items);
    } catch {
      void refreshWorkflows();
    }
  }, [apiBaseUrl, refreshWorkflows]);

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      const folder = await createWorkflowFolder(apiBaseUrl, name);
      setWorkflowOrg((prev) => prev
        ? { ...prev, folders: [...prev.folders, folder] }
        : { folders: [folder], items: [] }
      );
      return folder;
    } catch {
      return null;
    }
  }, [apiBaseUrl]);

  const handleRenameFolder = useCallback(async (folderId: string, name: string) => {
    setWorkflowOrg((prev) => {
      if (!prev) return prev;
      return { ...prev, folders: prev.folders.map((f) => f.id === folderId ? { ...f, name } : f) };
    });
    try {
      await renameWorkflowFolder(apiBaseUrl, folderId, name);
    } catch {
      void refreshWorkflows();
    }
  }, [apiBaseUrl, refreshWorkflows]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    setWorkflowOrg((prev) => {
      if (!prev) return prev;
      return {
        folders: prev.folders.filter((f) => f.id !== folderId),
        items: prev.items.map((i) => i.folderId === folderId ? { ...i, folderId: null } : i),
      };
    });
    try {
      await deleteWorkflowFolder(apiBaseUrl, folderId);
    } catch {
      void refreshWorkflows();
    }
  }, [apiBaseUrl, refreshWorkflows]);

  // Initial load
  useEffect(() => {
    void refreshWorkflows();
    void refreshAssetTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  useEffect(() => {
    const refresh = () => { void refreshWorkflows(); };
    window.addEventListener("api-key-changed", refresh);
    return () => window.removeEventListener("api-key-changed", refresh);
  }, [refreshWorkflows]);

  return {
    workflowsRemote,
    pinnedWorkflowIds,
    workflowOrg,
    workflowPreviewsFromApi,
    providerStatus,
    assetTypeRegistry,
    workflowError,
    refreshWorkflows,
    refreshAssetTypes,
    refreshWorkflowPreviews,
    handleTogglePin,
    handleReorderWorkflows,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  };
}
