// Survey service - handles all survey evaluation API operations
import { $api } from '@/utils/api'
import type {
  SurveyEvaluationForm,
  StudentSurveyResponse,
  SchoolOffice,
  AcademicTerm,
  ClassItem,
  StudentItem,
  DepartmentSelectOption,
} from '@/types'
import type { ServiceResponse, ListResponse } from './base.service'

class SurveyServiceClass {
  /**
   * Fetch response style options from Directus field metadata
   */
  async getResponseStyleOptions(): Promise<{ title: string; value: string }[]> {
    try {
      const res = await $api('/fields/StudentSurveyGroup/response_style')
      const choices = res.data?.meta?.options?.choices || []
      return choices.map((choice: { text: string; value: string }) => ({
        title: choice.text,
        value: choice.value,
      }))
    }
    catch (error) {
      console.error('Failed to fetch response style options:', error)
      return [
        { title: 'Rating-Scale Questions', value: 'Rating-Scale Questions' },
        { title: 'Open-Ended Question', value: 'Open-Ended Question' },
      ]
    }
  }

  /**
   * Fetch all academic terms (sorted by status priority and year)
   */
  async getActiveAcademicTerms(): Promise<ListResponse<AcademicTerm>> {
    try {
      const res = await $api('/items/academicTerms', {
        params: {
          sort: ['-schoolYear', 'semester'],
        },
      })
      // Sort: Active first, then Draft, then Archived
      const statusOrder: Record<string, number> = { Active: 0, Draft: 1, Archived: 2 }
      const sorted = (res.data || []).sort((a: AcademicTerm, b: AcademicTerm) => {
        const aOrder = statusOrder[a.status || ''] ?? 3
        const bOrder = statusOrder[b.status || ''] ?? 3
        return aOrder - bOrder
      })
      return { data: sorted, success: true }
    }
    catch (error) {
      console.error('Failed to fetch academic terms:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch all school offices (active first)
   */
  async getActiveSchoolOffices(): Promise<ListResponse<SchoolOffice>> {
    try {
      const res = await $api('/items/SchoolOffices', {
        params: {
          sort: ['name'],
        },
      })
      // Sort: active first
      const sorted = (res.data || []).sort((a: SchoolOffice, b: SchoolOffice) => {
        if (a.is_active === b.is_active) return 0
        return a.is_active ? -1 : 1
      })
      return { data: sorted, success: true }
    }
    catch (error) {
      console.error('Failed to fetch school offices:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch survey by ID with all related data
   */
  async getSurveyById(id: number): Promise<ServiceResponse<SurveyEvaluationForm | null>> {
    try {
      const res = await $api(`/items/StudentEvaluationSurvey/${id}`, {
        params: {
          fields: [
            '*',
            'academic_term_id.*',
            'office_id.*',
            'question_group.*',
            'question_group.questions.*',
          ],
        },
      })
      return { data: res.data, success: true }
    }
    catch (error) {
      console.error(`Failed to fetch survey ${id}:`, error)
      return { data: null, success: false, error: String(error) }
    }
  }

  /**
   * Save survey with question groups
   */
  async saveSurvey(id: number, form: SurveyEvaluationForm): Promise<ServiceResponse<void>> {
    try {
      await $api(`/items/StudentEvaluationSurvey/${id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          instruction: form.instruction,
          survey_start: form.survey_start,
          survey_end: form.survey_end,
          is_active: form.is_active,
          academic_term_id: form.academic_term_id,
          evaluation_type: form.evaluation_type,
          office_id: form.office_id,
          assignment_mode: form.assignment_mode,
          student_percentage: form.student_percentage,
          question_group: form.question_group,
        },
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error(`Failed to save survey ${id}:`, error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Fetch survey responses with answers
   */
  async getSurveyResponses(surveyId: number): Promise<ListResponse<StudentSurveyResponse>> {
    try {
      const res = await $api('/items/StudentSurveyResponses', {
        params: {
          filter: { survey_id: { _eq: surveyId } },
          fields: [
            '*',
            'student_id.*',
            'office_id.*',
            'answers.*',
            'answers.question_id.*',
          ],
          limit: -1,
        },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error(`Failed to fetch responses for survey ${surveyId}:`, error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch available classes for assignment
   */
  async getAvailableClasses(): Promise<ListResponse<ClassItem>> {
    try {
      const res = await $api('/items/classes', {
        params: {
          fields: [
            '*',
            'course_id.*',
            'teacher_id.*',
            'acadTerm_id.*',
            'student_id.students_id',
          ],
          limit: -1,
        },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error('Failed to fetch classes:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch assigned class IDs for a survey
   */
  async getAssignedClassIds(surveyId: number): Promise<number[]> {
    try {
      const res = await $api(`/items/StudentEvaluationSurvey/${surveyId}`, {
        params: {
          fields: ['classes.id', 'classes.classes_id'],
        },
      })
      const classes = res.data?.classes || []
      return classes.map((c: any) => c.classes_id).filter(Boolean)
    }
    catch (error) {
      console.error(`Failed to fetch assigned classes for survey ${surveyId}:`, error)
      return []
    }
  }

  /**
   * Fetch available students for assignment
   */
  async getAvailableStudents(): Promise<ListResponse<StudentItem>> {
    try {
      const res = await $api('/items/students', {
        params: {
          fields: ['*'],
          limit: -1,
        },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error('Failed to fetch students:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch assigned student IDs for a survey
   */
  async getAssignedStudentIds(surveyId: number): Promise<number[]> {
    try {
      const res = await $api(`/items/StudentEvaluationSurvey/${surveyId}`, {
        params: {
          fields: ['students.id', 'students.students_id'],
        },
      })
      const students = res.data?.students || []
      return students.map((s: any) => s.students_id).filter(Boolean)
    }
    catch (error) {
      console.error(`Failed to fetch assigned students for survey ${surveyId}:`, error)
      return []
    }
  }

  /**
   * Fetch departments for office evaluation
   */
  async getDepartments(): Promise<ListResponse<DepartmentSelectOption>> {
    try {
      const res = await $api('/items/Department', {
        params: {
          fields: ['id', 'name.id', 'name.programCode', 'name.programName'],
        },
      })
      const departments = (res.data || []).map((dept: any) => ({
        id: dept.id,
        name: dept.name?.programName || '',
        programCode: dept.name?.programCode || '',
      }))
      return { data: departments, success: true }
    }
    catch (error) {
      console.error('Failed to fetch departments:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Update class assignments for a survey
   */
  async updateClassAssignments(
    surveyId: number,
    currentJunctionIds: number[],
    newClassIds: number[],
    existingMapping: Map<number, number>,
  ): Promise<ServiceResponse<void>> {
    try {
      // Determine what to delete and create
      const toDelete: number[] = []
      const toCreate: number[] = []

      // Find deleted assignments
      for (const [classId, junctionId] of existingMapping.entries()) {
        if (!newClassIds.includes(classId)) {
          toDelete.push(junctionId)
        }
      }

      // Find new assignments
      for (const classId of newClassIds) {
        if (!existingMapping.has(classId)) {
          toCreate.push(classId)
        }
      }

      // Build update payload
      const classesPayload: any[] = []

      // Keep existing (not deleted)
      for (const [classId, junctionId] of existingMapping.entries()) {
        if (newClassIds.includes(classId)) {
          classesPayload.push({ id: junctionId, classes_id: classId })
        }
      }

      // Add new
      for (const classId of toCreate) {
        classesPayload.push({ classes_id: classId })
      }

      await $api(`/items/StudentEvaluationSurvey/${surveyId}`, {
        method: 'PATCH',
        body: { classes: classesPayload },
      })

      return { data: undefined, success: true }
    }
    catch (error) {
      console.error(`Failed to update class assignments for survey ${surveyId}:`, error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Update student assignments for a survey
   */
  async updateStudentAssignments(
    surveyId: number,
    studentIds: number[],
    existingMapping: Map<number, number>,
  ): Promise<ServiceResponse<void>> {
    try {
      const studentsPayload: any[] = []

      // Keep existing that are still selected
      for (const [studentId, junctionId] of existingMapping.entries()) {
        if (studentIds.includes(studentId)) {
          studentsPayload.push({ id: junctionId, students_id: studentId })
        }
      }

      // Add new
      for (const studentId of studentIds) {
        if (!existingMapping.has(studentId)) {
          studentsPayload.push({ students_id: studentId })
        }
      }

      await $api(`/items/StudentEvaluationSurvey/${surveyId}`, {
        method: 'PATCH',
        body: { students: studentsPayload },
      })

      return { data: undefined, success: true }
    }
    catch (error) {
      console.error(`Failed to update student assignments for survey ${surveyId}:`, error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Fetch classes with student details for report generation
   */
  async getClassesWithStudents(classIds: number[]): Promise<ListResponse<ClassItem>> {
    if (classIds.length === 0) {
      return { data: [], success: true }
    }

    try {
      const res = await $api('/items/classes', {
        params: {
          filter: { id: { _in: classIds } },
          fields: [
            '*',
            'course_id.*',
            'teacher_id.*',
            'student_id.students_id',
          ],
        },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error('Failed to fetch classes with students:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Fetch students with enrolled classes for office evaluation
   */
  async getStudentsWithClasses(): Promise<ListResponse<StudentItem>> {
    try {
      const res = await $api('/items/students', {
        params: {
          filter: { class_id: { _nnull: true } },
          fields: ['*', 'class_id.*'],
          limit: -1,
        },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error('Failed to fetch students with classes:', error)
      return { data: [], success: false, error: String(error) }
    }
  }
}

// Export singleton instance
export const SurveyService = new SurveyServiceClass()
