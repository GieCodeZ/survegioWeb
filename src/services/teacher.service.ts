// Teacher service - handles all teacher-related API operations
import type { Teacher, TeacherForm, Department } from '@/types'
import { BaseService, type ServiceResponse, type ListResponse } from './base.service'

class TeacherServiceClass extends BaseService<Teacher> {
  constructor() {
    super('Teachers')
  }

  /**
   * Fetch all teachers sorted by last name
   */
  async getAllSorted(): Promise<ListResponse<Teacher>> {
    return this.getAll({
      fields: ['*'],
      sort: 'last_name',
    })
  }

  /**
   * Create a new teacher from form data
   */
  async createFromForm(form: TeacherForm): Promise<ServiceResponse<Teacher | null>> {
    const body = {
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      position: form.position,
      gender: form.gender,
      email: form.email,
      is_active: form.is_active,
    }

    return this.create(body as any)
  }

  /**
   * Update an existing teacher from form data
   */
  async updateFromForm(id: number, form: TeacherForm): Promise<ServiceResponse<Teacher | null>> {
    const body = {
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      position: form.position,
      gender: form.gender,
      email: form.email,
      is_active: form.is_active,
    }

    return this.update(id, body as any)
  }

  /**
   * Link a user account to a teacher
   */
  async linkUserAccount(teacherId: number, userId: string): Promise<ServiceResponse<Teacher | null>> {
    return this.update(teacherId, { user_id: userId } as any)
  }

  /**
   * Get full name of a teacher
   */
  getFullName(teacher: Teacher): string {
    const middle = teacher.middle_name ? ` ${teacher.middle_name}` : ''
    return `${teacher.last_name || ''}, ${teacher.first_name || ''}${middle}`
  }

  /**
   * Check if teacher has an account
   */
  hasAccount(teacher: Teacher): boolean {
    return !!teacher.user_id
  }

  /**
   * Check if teacher is a Dean
   */
  isDean(teacher: Teacher): boolean {
    return teacher.position?.toLowerCase() === 'dean'
  }

  /**
   * Check if teacher is active
   */
  isActive(teacher: Teacher): boolean {
    return teacher.is_active === 'Active'
  }

  /**
   * Check if teacher is assigned to a specific department
   */
  isInDepartment(teacher: Teacher, department: Department): boolean {
    if (!teacher.id) return false

    const teacherIds = department.teacher_id || []
    return teacherIds.some((t: any) => {
      const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
      return tId === teacher.id
    })
  }

  /**
   * Get departments the teacher is assigned to
   */
  getDepartmentNames(teacher: Teacher, departments: Department[]): string[] {
    if (!teacher.id) return []

    const deptNames: string[] = []

    for (const dept of departments) {
      if (this.isInDepartment(teacher, dept) && dept.name) {
        if (typeof dept.name === 'object' && dept.name !== null) {
          deptNames.push(dept.name.programCode || dept.name.programName)
        }
      }
    }

    return deptNames
  }

  /**
   * Get the first department ID the teacher is assigned to
   */
  getDepartmentId(teacher: Teacher, departments: Department[]): number | null {
    if (!teacher.id) return null

    for (const dept of departments) {
      if (this.isInDepartment(teacher, dept)) {
        return dept.id ?? null
      }
    }

    return null
  }

  /**
   * Find the Dean for a specific department
   */
  findDepartmentDean(departmentId: number, teachers: Teacher[], departments: Department[]): Teacher | null {
    const dept = departments.find(d => d.id === departmentId)
    if (!dept) return null

    const teacherIds = dept.teacher_id || []

    for (const t of teacherIds) {
      const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
      const teacher = teachers.find(teach => teach.id === tId)
      if (teacher && this.isDean(teacher)) {
        return teacher
      }
    }

    return null
  }
}

// Export singleton instance
export const TeacherService = new TeacherServiceClass()
