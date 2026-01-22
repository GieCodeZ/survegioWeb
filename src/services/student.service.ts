// Student service - handles all student-related API operations
import type { Student, StudentForm } from '@/types'
import { BaseService, type ListResponse, type ServiceResponse } from './base.service'

class StudentServiceClass extends BaseService<Student> {
  constructor() {
    super('students')
  }

  /**
   * Fetch all students with related data (department, classes)
   */
  async getAllWithRelations(): Promise<ListResponse<Student>> {
    return this.getAll({
      fields: ['*', 'deparment_id.*', 'deparment_id.name.*', 'class_id.*'],
    })
  }

  /**
   * Create a new student from form data
   */
  async createFromForm(form: StudentForm): Promise<ServiceResponse<Student | null>> {
    const body: any = {
      student_number: form.student_number,
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      email: form.email,
      gender: form.gender,
      deparment_id: form.deparment_id,
      is_active: form.is_active,
      year_level: form.year_level,
    }

    // Handle class_id - Directus M2M expects array of junction objects
    if (form.class_id.length > 0) {
      body.class_id = form.class_id.map(classId => ({ classes_id: classId }))
    }
    else {
      body.class_id = []
    }

    return this.create(body)
  }

  /**
   * Update an existing student from form data
   */
  async updateFromForm(id: number, form: StudentForm): Promise<ServiceResponse<Student | null>> {
    const body: any = {
      student_number: form.student_number,
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      email: form.email,
      gender: form.gender,
      deparment_id: form.deparment_id,
      is_active: form.is_active,
      year_level: form.year_level,
    }

    // Handle class_id - Directus M2M expects array of junction objects
    if (form.class_id.length > 0) {
      body.class_id = form.class_id.map(classId => ({ classes_id: classId }))
    }
    else {
      body.class_id = []
    }

    return this.update(id, body)
  }

  /**
   * Link a user account to a student
   */
  async linkUserAccount(studentId: number, userId: string): Promise<ServiceResponse<Student | null>> {
    return this.update(studentId, { user_id: userId } as any)
  }

  /**
   * Get full name of a student
   */
  getFullName(student: Student): string {
    const middle = student.middle_name ? ` ${student.middle_name}` : ''
    return `${student.last_name || ''}, ${student.first_name || ''}${middle}`
  }

  /**
   * Check if student has an account
   */
  hasAccount(student: Student): boolean {
    return !!student.user_id
  }

  /**
   * Check if student is active
   */
  isActive(student: Student): boolean {
    return student.is_active === 'Active'
  }

  /**
   * Extract class IDs from a student's class_id junction array
   */
  extractClassIds(student: Student): number[] {
    if (!student.class_id || !Array.isArray(student.class_id)) {
      return []
    }
    return student.class_id
      .map((c: any) => c.classes_id || c.id)
      .filter(Boolean)
  }

  /**
   * Get department ID from student (handles populated vs ID-only cases)
   */
  getDepartmentId(student: Student): number | null {
    if (!student.deparment_id) return null
    if (typeof student.deparment_id === 'object') {
      return student.deparment_id.id ?? null
    }
    return student.deparment_id
  }
}

// Export singleton instance
export const StudentService = new StudentServiceClass()
