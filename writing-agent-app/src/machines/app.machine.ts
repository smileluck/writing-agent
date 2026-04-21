import { assign, fromPromise, setup } from 'xstate'

import { appApi } from '../lib/invoke'
import type { AppView, BootstrapPayload, ProjectSummary } from '../types'

interface AppContext {
  boot: BootstrapPayload | null
  view: AppView
  activeProjectId: string | null
  error: string | null
  pendingView: AppView | null
  pendingProjectId: string | null
}

type AppEvent =
  | { type: 'NAVIGATE'; view: AppView }
  | { type: 'OPEN_WORKSPACE_CREATE' }
  | { type: 'OPEN_PROJECT'; projectId: string }
  | { type: 'RELOAD'; view?: AppView; activeProjectId?: string | null }
  | { type: 'SYNC_PROJECT'; project: ProjectSummary }

function resolveView(context: AppContext, output: BootstrapPayload): AppView {
  if (context.pendingView) {
    return context.pendingView
  }

  if (output.needsOnboarding) {
    return 'home'
  }

  return context.view ?? 'home'
}

function syncProjectSummary(projects: ProjectSummary[], project: ProjectSummary) {
  const nextProjects = [...projects]
  const index = nextProjects.findIndex((item) => item.id === project.id)

  if (index === -1) {
    nextProjects.unshift(project)
    return nextProjects
  }

  nextProjects[index] = project
  return nextProjects
}

export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as AppEvent,
  },
  actors: {
    bootstrap: fromPromise(async () => appApi.bootstrapApp()),
  },
}).createMachine({
  id: 'app',
  initial: 'booting',
  context: {
    boot: null,
    view: 'home',
    activeProjectId: null,
    error: null,
    pendingView: null,
    pendingProjectId: null,
  },
  states: {
    booting: {
      invoke: {
        src: 'bootstrap',
        onDone: {
          target: 'ready',
          actions: assign(({ context, event }) => ({
            boot: event.output,
            view: resolveView(context, event.output),
            activeProjectId: context.pendingProjectId ?? context.activeProjectId,
            error: null,
            pendingView: null,
            pendingProjectId: null,
          })),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : '应用启动失败',
          }),
        },
      },
    },
    ready: {
      on: {
        NAVIGATE: {
          actions: assign({
            view: ({ event }) => event.view,
          }),
        },
        OPEN_WORKSPACE_CREATE: {
          actions: assign({
            view: 'workspace-new',
          }),
        },
        OPEN_PROJECT: {
          actions: assign({
            view: 'workspace',
            activeProjectId: ({ event }) => event.projectId,
          }),
        },
        RELOAD: {
          target: 'booting',
          actions: assign({
            pendingView: ({ event }) => event.view ?? null,
            pendingProjectId: ({ event }) => event.activeProjectId ?? null,
          }),
        },
        SYNC_PROJECT: {
          actions: assign({
            boot: ({ context, event }) => {
              if (!context.boot) {
                return context.boot
              }

              return {
                ...context.boot,
                projects: syncProjectSummary(context.boot.projects, event.project),
              }
            },
          }),
        },
      },
    },
    error: {
      on: {
        RELOAD: {
          target: 'booting',
          actions: assign({
            pendingView: ({ event }) => event.view ?? null,
            pendingProjectId: ({ event }) => event.activeProjectId ?? null,
          }),
        },
      },
    },
  },
})
