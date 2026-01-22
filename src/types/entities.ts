// Domain entity types for Survegio

// Base entity with common fields
export interface BaseEntity {
  id?: number
  date_created?: string
  date_updated?: string | null
}

// Program entity
export interface Program {
  id: number
  programName: string
  programCode: string
}

// Department entity
export interface Department extends BaseEntity {
  name: Program | number | null
  teacher_id?: DepartmentTeacher[]
}

// Junction table type for Department-Teacher relationship
export interface DepartmentTeacher {
  id?: number
  Teachers_id?: number
}

// Student entity
export interface Student extends BaseEntity {
  student_number: string
  first_name: string
  middle_name: string
  last_name: string
  email: string
  gender: string
  deparment_id: Department | number | null
  class_id?: StudentClass[]
  user_id?: string | null
  is_active?: string
  year_level?: string
}

// Junction table type for Student-Class relationship
export interface StudentClass {
  id?: number
  classes_id?: number
}

// Teacher entity
export interface Teacher extends BaseEntity {
  first_name: string
  middle_name: string
  last_name: string
  position: string
  gender: string
  email: string
  Department?: number[] | null
  user_id?: string | null
  is_active?: string
}

// Course entity
export interface Course extends BaseEntity {
  courseCode: string
  courseName: string
}

// Class entity
export interface ClassItem extends BaseEntity {
  section: string
  course_id?: Course | number | null
  teacher_id?: Teacher | number | null
  department_id?: Department | number | null
  acadTerm_id?: AcademicTerm | number | null
  students?: StudentClass[]
}

// Academic term entity
export interface AcademicTerm extends BaseEntity {
  schoolYear: string
  semester: string
  startDate?: string
  endDate?: string
  status?: 'Active' | 'Draft' | 'Archived'
}

// Role entity (Directus roles)
export interface Role {
  id: string
  name: string
}

// User account credential (for account creation/password reset)
export interface AccountCredential {
  name: string
  email: string
  password: string
}

// Survey related entities

// Individual question within a survey group
export interface StudentQuestion {
  id?: number
  question: string
  sort?: number
}

// Question group (section) within a survey
export interface StudentSurveyGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: StudentQuestion[]
}

// Complete survey form data for student evaluation surveys
export interface SurveyEvaluationForm {
  id?: number
  title: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: SurveyStatus
  academic_term_id: number | null
  evaluation_type: EvaluationType
  office_id: number | null
  assignment_mode: 'all' | 'department' | 'specific'
  student_percentage: number
  question_group: StudentSurveyGroup[]
}

// Survey answer from a student response
export interface SurveyAnswer {
  id: number
  question_id: number | StudentQuestion
  answer_value: string
}

// Survey response from a student
export interface StudentSurveyResponse {
  id: number
  survey_id: number
  student_id: StudentItem | number
  class_id?: number
  office_id?: number | { id: number; name: string }
  submitted_at: string
  year_level?: string
  answers?: SurveyAnswer[]
}

// Statistics for a single question
export interface QuestionStats {
  questionId: number
  questionText: string
  responseStyle: string
  totalResponses: number
  average?: number
  distribution?: Record<string, number>
}

// Student item for assignment
export interface StudentItem {
  id: number
  first_name: string
  last_name: string
  student_number: string
  email?: string
  deparment_id?: number
  year_level?: string
}

// School office entity
export interface SchoolOffice extends BaseEntity {
  name: string
  description?: string
  is_active?: boolean
}

// Department option for dropdowns
export interface DepartmentSelectOption {
  id: number
  name: string
  programCode?: string
}

// Class evaluation data for reports
export interface ClassEvaluationData {
  classId: number
  section: string
  courseCode: string
  courseName: string
  totalRespondents: number
  totalStudents: number
  responseRate: number
  overallAverage: number
  questionStats: {
    groupTitle: string
    questions: {
      questionText: string
      average: number
      distribution: Record<string, number>
      totalResponses: number
    }[]
  }[]
  comments: string[]
}

// Instructor report data for class-based evaluations
export interface InstructorReportData {
  instructorId: number
  instructorName: string
  academicTerm: string
  totalClasses: number
  totalRespondents: number
  totalStudents: number
  overallAverage: number
  responseRate: number
  classes: ClassEvaluationData[]
}

// Office report data for office-based evaluations
export interface OfficeReportData {
  officeId: number
  officeName: string
  surveyTitle: string
  academicTerm: string
  totalRespondents: number
  totalExpected: number
  responseRate: number
  overallAverage: number
  questionStats: {
    groupTitle: string
    questions: {
      questionText: string
      average: number
      distribution: Record<string, number>
      totalResponses: number
    }[]
  }[]
  comments: string[]
  responses: {
    studentName: string
    studentNumber: string
    program: string
    submittedAt: string
    answers: {
      groupTitle: string
      questionText: string
      answerValue: string
      responseStyle: string
    }[]
  }[]
}

// Legacy survey types (kept for backwards compatibility)
export interface Survey extends BaseEntity {
  title: string
  description?: string
  status: SurveyStatus
  type?: EvaluationType
  questions?: SurveyQuestion[]
}

export interface SurveyQuestion extends BaseEntity {
  survey_id: number
  question_text: string
  question_type: 'rating' | 'text' | 'multiple_choice'
  order: number
  options?: string[]
  required?: boolean
}

export interface SurveyResponse extends BaseEntity {
  survey_id: number
  student_id: number
  class_id?: number
  responses: QuestionResponse[]
  submitted_at?: string
}

export interface QuestionResponse {
  question_id: number
  value: string | number
}

// User entity (Directus user)
export interface User {
  id: string
  email: string
  first_name?: string
  last_name?: string
  role?: string | Role
  status?: 'active' | 'suspended' | 'invited'
}

// Helper type for entities that can be populated or just IDs
export type PopulatedOr<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] extends (infer U | number | null) ? U | number | null : T[P]
}

// Status types
export type EntityStatus = 'Active' | 'Inactive' | 'Draft'
export type Gender = 'M' | 'F'
export type YearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year'
export type TeacherPosition = 'Dean' | 'Professor'
export type SurveyStatus = 'Draft' | 'Active' | 'Archived'
export type EvaluationType = 'Class' | 'Office'
