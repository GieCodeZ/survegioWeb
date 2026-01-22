// Course service - handles all course-related API operations
import { $api } from '@/utils/api'
import type { Course, CourseForm, ClassItem } from '@/types'
import { BaseService, type ServiceResponse, type ListResponse } from './base.service'

class CourseServiceClass extends BaseService<Course> {
  constructor() {
    super('courses')
  }

  /**
   * Fetch all courses sorted by date created (newest first)
   */
  async getAllSorted(): Promise<ListResponse<Course>> {
    return this.getAll({
      sort: '-date_created',
    })
  }

  /**
   * Create a new course from form data
   */
  async createFromForm(form: CourseForm): Promise<ServiceResponse<Course | null>> {
    return this.create({
      courseCode: form.courseCode,
      courseName: form.courseName,
    })
  }

  /**
   * Update an existing course from form data
   */
  async updateFromForm(id: number, form: CourseForm): Promise<ServiceResponse<Course | null>> {
    return this.update(id, {
      courseCode: form.courseCode,
      courseName: form.courseName,
    })
  }

  /**
   * Check if a course can be deleted (no classes using it)
   */
  async canDelete(courseId: number): Promise<{ canDelete: boolean; relatedClasses: ClassItem[] }> {
    try {
      const res = await $api('/items/classes', {
        params: {
          filter: { course_id: { _eq: courseId } },
          fields: ['id', 'section', 'teacher_id.first_name', 'teacher_id.last_name', 'acadTerm_id.schoolYear', 'acadTerm_id.semester'],
        },
      })

      const classes = res.data || []
      return {
        canDelete: classes.length === 0,
        relatedClasses: classes,
      }
    }
    catch (error) {
      console.error('Failed to check course deletion:', error)
      return { canDelete: false, relatedClasses: [] }
    }
  }

  /**
   * Delete a course only if it has no related classes
   */
  async safeDelete(courseId: number): Promise<ServiceResponse<void> & { blockedReason?: string; relatedClasses?: ClassItem[] }> {
    const { canDelete, relatedClasses } = await this.canDelete(courseId)

    if (!canDelete) {
      return {
        data: undefined,
        success: false,
        error: 'Course has related classes',
        blockedReason: 'classes',
        relatedClasses,
      }
    }

    return this.delete(courseId)
  }
}

// Export singleton instance
export const CourseService = new CourseServiceClass()
