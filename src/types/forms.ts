// Form-related types for Survegio

import type { EntityStatus, Gender, TeacherPosition, YearLevel } from './entities'

// Student form data
export interface StudentForm {
  id?: number
  student_number: string
  first_name: string
  middle_name: string
  last_name: string
  email: string
  gender: Gender | string
  deparment_id: number | null
  class_id: number[]
  is_active: EntityStatus | string
  user_id: string | null
  year_level: YearLevel | string | null
}

// Teacher form data
export interface TeacherForm {
  id?: number
  first_name: string
  middle_name: string
  last_name: string
  position: TeacherPosition | string
  gender: Gender | string
  email: string
  Department: number[] | null
  department_id: number | null
  is_active: EntityStatus | string
  user_id: string | null
}

// Course form data
export interface CourseForm {
  id?: number
  courseCode: string
  courseName: string
}

// Class form data
export interface ClassForm {
  id?: number
  section: string
  course_id: number | null
  teacher_id: number | null
  department_id: number | null
  acadTerm_id: number | null
}

// Department form data
export interface DepartmentForm {
  id?: number
  name: number | null
  teacher_id: number[]
}

// Academic term form data
export interface AcademicTermForm {
  id?: number
  schoolYear: string
  semester: string
  is_active: boolean
}

// Survey form data
export interface SurveyForm {
  id?: number
  title: string
  description: string
  status: 'Draft' | 'Active' | 'Archived'
  type: 'Class' | 'Office'
}

// Dropdown/Select option types
export interface SelectOption<T = string | number> {
  id: T
  title: string
  subtitle?: string
}

export interface DepartmentOption extends SelectOption<number> {
  programCode: string
  programName: string
}

export interface ClassOption extends SelectOption<number> {
  section: string
  courseCode?: string
}

// Filter state types
export interface StudentFilters {
  search: string
  status: EntityStatus | null
  department: number | null
  yearLevel: YearLevel | null
}

export interface TeacherFilters {
  search: string
  status: EntityStatus | null
  department: number | null
  position: TeacherPosition | null
}

export interface CourseFilters {
  search: string
}

export interface ClassFilters {
  search: string
  department: number | null
  course: number | null
  academicTerm: number | null
}

// Table header type
export interface TableHeader {
  title: string
  key: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
}

// Dialog state type
export interface DialogState {
  isOpen: boolean
  isEditing: boolean
  isLoading: boolean
}
