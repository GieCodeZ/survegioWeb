// Composable for course data management
import type { Course, CourseForm, ClassItem } from '@/types'
import { CourseService } from '@/services'

export function useCourses() {
  // State
  const courses = ref<Course[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all courses
  const fetchCourses = async () => {
    isLoading.value = true
    error.value = null
    const result = await CourseService.getAllSorted()
    courses.value = result.data
    if (!result.success) error.value = result.error ?? null
    isLoading.value = false
  }

  // Create a course
  const createCourse = async (form: CourseForm) => {
    const result = await CourseService.createFromForm(form)
    if (result.success) {
      await fetchCourses()
    }
    return result
  }

  // Update a course
  const updateCourse = async (id: number, form: CourseForm) => {
    const result = await CourseService.updateFromForm(id, form)
    if (result.success) {
      await fetchCourses()
    }
    return result
  }

  // Check if course can be deleted
  const checkCourseDeletion = async (courseId: number): Promise<{ canDelete: boolean; relatedClasses: ClassItem[] }> => {
    return CourseService.canDelete(courseId)
  }

  // Delete a course (with safety check)
  const deleteCourse = async (courseId: number) => {
    const result = await CourseService.safeDelete(courseId)
    if (result.success) {
      await fetchCourses()
    }
    return result
  }

  // Filter courses by search term
  const filterBySearch = (search: string) => {
    if (!search) return courses.value
    const searchLower = search.toLowerCase()
    return courses.value.filter(c =>
      c.courseCode.toLowerCase().includes(searchLower)
      || c.courseName.toLowerCase().includes(searchLower),
    )
  }

  return {
    // State
    courses,
    isLoading,
    error,
    // Actions
    fetchCourses,
    createCourse,
    updateCourse,
    deleteCourse,
    checkCourseDeletion,
    filterBySearch,
  }
}
