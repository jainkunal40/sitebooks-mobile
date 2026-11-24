import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { countPendingMessages, getOwner, getProjectBundle, listClients, listMessages, listProjectSummaries } from '@/db/queries'
import { getClientProfile, getSharedProject, listOutbox, listSharedProjects } from '@/db/client-queries'

export const queryKeys = {
  owner: ['owner'] as const,
  projects: (ownerId: string) => ['projects', ownerId] as const,
  project: (ownerId: string, projectId: string) => ['project', ownerId, projectId] as const,
  clients: (ownerId: string) => ['clients', ownerId] as const,
  messages: (ownerId: string) => ['messages', ownerId] as const,
  pending: (ownerId: string) => ['messages', ownerId, 'pending'] as const,
}

export function useOwner() {
  return useQuery({ queryKey: queryKeys.owner, queryFn: getOwner })
}

export function useProjectSummaries(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects(ownerId ?? ''),
    queryFn: () => listProjectSummaries(ownerId as string),
    enabled: !!ownerId,
  })
}

export function useProject(ownerId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(ownerId ?? '', projectId ?? ''),
    queryFn: () => getProjectBundle(ownerId as string, projectId as string),
    enabled: !!ownerId && !!projectId,
  })
}

export function useClients(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clients(ownerId ?? ''),
    queryFn: () => listClients(ownerId as string),
    enabled: !!ownerId,
  })
}

export function useMessages(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.messages(ownerId ?? ''),
    queryFn: () => listMessages(ownerId as string),
    enabled: !!ownerId,
  })
}

export function usePendingMessages(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pending(ownerId ?? ''),
    queryFn: () => countPendingMessages(ownerId as string),
    enabled: !!ownerId,
  })
}

/** Invalidates the detail bundle and the dashboard list after a write. */
export function useProjectRefresh(ownerId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    if (!ownerId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.project(ownerId, projectId ?? '') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(ownerId) }),
    ])
  }, [queryClient, ownerId, projectId])
}

// ─── Client mode ────────────────────────────────────────────

export function useClientProfile() {
  return useQuery({ queryKey: ['clientProfile'], queryFn: getClientProfile })
}

export function useSharedProjects(profileId: string | undefined) {
  return useQuery({
    queryKey: ['sharedProjects', profileId ?? ''],
    queryFn: () => listSharedProjects(profileId as string),
    enabled: !!profileId,
  })
}

export function useSharedProject(profileId: string | undefined, remoteProjectId: string | undefined) {
  return useQuery({
    queryKey: ['sharedProject', profileId ?? '', remoteProjectId ?? ''],
    queryFn: () => getSharedProject(profileId as string, remoteProjectId as string),
    enabled: !!profileId && !!remoteProjectId,
  })
}

export function useOutbox(profileId: string | undefined) {
  return useQuery({
    queryKey: ['outbox', profileId ?? ''],
    queryFn: () => listOutbox(profileId as string),
    enabled: !!profileId,
  })
}
