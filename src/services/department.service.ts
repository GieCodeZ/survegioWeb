// Department service - handles all department-related API operations
import type { Department, DepartmentOption } from '@/types'
import { BaseService, type ServiceResponse, type ListResponse } from './base.service'

class DepartmentServiceClass extends BaseService<Department> {
  constructor() {
    super('Department')
  }

  /**
   * Fetch all departments with related program data
   */
  async getAllWithProgram(): Promise<ListResponse<Department>> {
    return this.getAll({
      fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
    })
  }

  /**
   * Fetch all departments with teachers
   */
  async getAllWithTeachers(): Promise<ListResponse<Department>> {
    return this.getAll({
      fields: ['id', 'name.id', 'name.programName', 'name.programCode', 'teacher_id.id', 'teacher_id.Teachers_id'],
    })
  }

  /**
   * Update the teachers assigned to a department
   */
  async updateTeachers(departmentId: number, teacherIds: number[]): Promise<ServiceResponse<Department | null>> {
    const teacherIdObjects = teacherIds.map(id => ({ Teachers_id: id }))
    return this.update(departmentId, { teacher_id: teacherIdObjects } as any)
  }

  /**
   * Add a teacher to a department
   */
  async addTeacher(departmentId: number, teacherId: number, currentTeachers: any[]): Promise<ServiceResponse<Department | null>> {
    // Check if already assigned
    const alreadyAssigned = currentTeachers.some((t: any) => {
      const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
      return tId === teacherId
    })

    if (alreadyAssigned) {
      return { data: null, success: true } // Already assigned, no action needed
    }

    // Preserve existing entries and add new one
    const updatedTeacherIds = [
      ...currentTeachers.map((t: any) => {
        if (typeof t === 'object' && t.id) {
          return { id: t.id, Teachers_id: t.Teachers_id }
        }
        return { Teachers_id: typeof t === 'number' ? t : t.Teachers_id }
      }),
      { Teachers_id: teacherId },
    ]

    return this.update(departmentId, { teacher_id: updatedTeacherIds } as any)
  }

  /**
   * Remove a teacher from a department
   */
  async removeTeacher(departmentId: number, teacherId: number, currentTeachers: any[]): Promise<ServiceResponse<Department | null>> {
    const updatedTeacherIds = currentTeachers
      .filter((t: any) => {
        const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
        return tId !== teacherId
      })
      .map((t: any) => {
        if (typeof t === 'object' && t.id) {
          return { id: t.id, Teachers_id: t.Teachers_id }
        }
        return { Teachers_id: typeof t === 'number' ? t : t.Teachers_id }
      })

    return this.update(departmentId, { teacher_id: updatedTeacherIds } as any)
  }

  /**
   * Convert departments to dropdown options
   */
  toOptions(departments: Department[]): DepartmentOption[] {
    return departments.map(dept => ({
      id: dept.id ?? 0,
      title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '',
      subtitle: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
      programCode: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '',
      programName: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
    }))
  }

  /**
   * Get department name (program code) by ID
   */
  getName(departmentId: number, departments: Department[]): string {
    const dept = departments.find(d => d.id === departmentId)
    if (dept && typeof dept.name === 'object' && dept.name !== null) {
      return dept.name.programCode || dept.name.programName || ''
    }
    return ''
  }
}

// Export singleton instance
export const DepartmentService = new DepartmentServiceClass()
