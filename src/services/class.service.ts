// Class service - handles all class-related API operations
import type { ClassItem, ClassOption } from '@/types'
import { BaseService, type ListResponse } from './base.service'

class ClassServiceClass extends BaseService<ClassItem> {
  constructor() {
    super('classes')
  }

  /**
   * Fetch all classes with course data
   */
  async getAllWithCourse(): Promise<ListResponse<ClassItem>> {
    return this.getAll({
      fields: ['id', 'section', 'course_id.courseCode', 'department_id'],
    })
  }

  /**
   * Fetch all classes with full details
   */
  async getAllWithDetails(): Promise<ListResponse<ClassItem>> {
    return this.getAll({
      fields: [
        'id',
        'section',
        'course_id.id',
        'course_id.courseCode',
        'course_id.courseName',
        'teacher_id.id',
        'teacher_id.first_name',
        'teacher_id.last_name',
        'department_id.id',
        'department_id.name.programCode',
        'acadTerm_id.id',
        'acadTerm_id.schoolYear',
        'acadTerm_id.semester',
      ],
    })
  }

  /**
   * Fetch classes by teacher ID
   */
  async getByTeacher(teacherId: number): Promise<ListResponse<ClassItem>> {
    return this.getAll({
      filter: { teacher_id: { _eq: teacherId } },
      fields: ['id', 'section', 'course_id.courseCode', 'acadTerm_id.schoolYear', 'acadTerm_id.semester'],
    })
  }

  /**
   * Fetch classes by department ID
   */
  async getByDepartment(departmentId: number): Promise<ListResponse<ClassItem>> {
    return this.getAll({
      filter: { department_id: { _eq: departmentId } },
      fields: ['id', 'section', 'course_id.courseCode'],
    })
  }

  /**
   * Convert classes to dropdown options
   */
  toOptions(classes: ClassItem[]): ClassOption[] {
    return classes.map(cls => ({
      id: cls.id ?? 0,
      title: cls.section,
      section: cls.section,
      subtitle: typeof cls.course_id === 'object' && cls.course_id !== null ? cls.course_id.courseCode : '',
      courseCode: typeof cls.course_id === 'object' && cls.course_id !== null ? cls.course_id.courseCode : '',
    }))
  }

  /**
   * Get class display name (section with course code)
   */
  getDisplayName(cls: ClassItem): string {
    const courseCode = typeof cls.course_id === 'object' && cls.course_id !== null
      ? cls.course_id.courseCode
      : ''
    return courseCode ? `${cls.section} (${courseCode})` : cls.section
  }
}

// Export singleton instance
export const ClassService = new ClassServiceClass()
