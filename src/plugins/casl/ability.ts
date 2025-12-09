import { createMongoAbility } from '@casl/ability'

export type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage'

// Subjects for different roles and features
export type Subjects =
  | 'all'
  | 'Auth'
  | 'Dashboard'
  // Admin subjects
  | 'programs'
  | 'courses'
  | 'class-sections'
  | 'academic-terms'
  | 'departments'
  | 'classes'
  | 'students'
  | 'teachers'

export interface Rule { action: Actions; subject: Subjects }

export const ability = createMongoAbility<[Actions, Subjects]>()
