// Composable for student data management
import type { Student, Department, ClassItem, StudentForm, AccountCredential } from '@/types'
import { StudentService, DepartmentService, ClassService, UserService } from '@/services'

export function useStudents() {
  // State
  const students = ref<Student[]>([])
  const departments = ref<Department[]>([])
  const classes = ref<ClassItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all students with relations
  const fetchStudents = async () => {
    isLoading.value = true
    error.value = null
    const result = await StudentService.getAllWithRelations()
    students.value = result.data
    if (!result.success) error.value = result.error ?? null
    isLoading.value = false
  }

  // Fetch supporting data (departments and classes)
  const fetchSupportingData = async () => {
    const [deptResult, classResult] = await Promise.all([
      DepartmentService.getAllWithProgram(),
      ClassService.getAllWithCourse(),
    ])
    departments.value = deptResult.data
    classes.value = classResult.data
  }

  // Create a student
  const createStudent = async (form: StudentForm) => {
    const result = await StudentService.createFromForm(form)
    if (result.success) {
      await fetchStudents()
    }
    return result
  }

  // Update a student
  const updateStudent = async (id: number, form: StudentForm) => {
    const result = await StudentService.updateFromForm(id, form)
    if (result.success) {
      // Update user status if student has an account
      if (form.user_id) {
        await UserService.updateStatus(form.user_id, form.is_active === 'Active')
      }
      await fetchStudents()
    }
    return result
  }

  // Delete a student
  const deleteStudent = async (student: Student) => {
    // Delete user account first if exists
    if (student.user_id) {
      await UserService.deleteUser(student.user_id)
    }
    const result = await StudentService.delete(student.id!)
    if (result.success) {
      await fetchStudents()
    }
    return result
  }

  // Create accounts for multiple students
  const createAccounts = async (studentsToCreate: Student[]): Promise<AccountCredential[]> => {
    const credentials: AccountCredential[] = []

    for (const student of studentsToCreate) {
      if (StudentService.hasAccount(student) || !StudentService.isActive(student)) {
        continue
      }

      const result = await UserService.createStudentAccount(
        student.id!,
        student.email,
        student.first_name,
        student.last_name,
        (studentId, userId) => StudentService.linkUserAccount(studentId, userId),
      )

      if (result.success && result.data) {
        result.data.name = StudentService.getFullName(student)
        credentials.push(result.data)
      }
    }

    if (credentials.length > 0) {
      await fetchStudents()
    }

    return credentials
  }

  // Reset password for a student
  const resetPassword = async (student: Student): Promise<AccountCredential | null> => {
    if (!student.user_id) return null

    const password = UserService.generatePassword()
    const result = await UserService.resetPassword(student.user_id, password)

    if (result.success) {
      return {
        name: StudentService.getFullName(student),
        email: student.email,
        password,
      }
    }

    return null
  }

  // Filter students by status
  const filterByStatus = (status: string | null) => {
    if (!status) return students.value
    return students.value.filter(s => s.is_active === status)
  }

  // Get department options for dropdowns
  const departmentOptions = computed(() => DepartmentService.toOptions(departments.value))

  // Get class options for dropdowns
  const classOptions = computed(() => ClassService.toOptions(classes.value))

  // Get students without accounts (only active)
  const studentsWithoutAccounts = (selectedStudents: Student[]) => {
    return selectedStudents.filter(s => !StudentService.hasAccount(s) && StudentService.isActive(s))
  }

  return {
    // State
    students,
    departments,
    classes,
    isLoading,
    error,
    // Actions
    fetchStudents,
    fetchSupportingData,
    createStudent,
    updateStudent,
    deleteStudent,
    createAccounts,
    resetPassword,
    filterByStatus,
    studentsWithoutAccounts,
    // Computed
    departmentOptions,
    classOptions,
    // Static helpers (re-exported for convenience)
    getFullName: StudentService.getFullName,
    hasAccount: StudentService.hasAccount,
    isActive: StudentService.isActive,
    extractClassIds: StudentService.extractClassIds,
    getDepartmentId: StudentService.getDepartmentId,
  }
}
