// Composable for teacher data management
import type { Teacher, Department, ClassItem, TeacherForm, AccountCredential } from '@/types'
import { TeacherService, DepartmentService, ClassService, UserService } from '@/services'

export function useTeachers() {
  // State
  const teachers = ref<Teacher[]>([])
  const departments = ref<Department[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all teachers
  const fetchTeachers = async () => {
    isLoading.value = true
    error.value = null
    const result = await TeacherService.getAllSorted()
    teachers.value = result.data
    if (!result.success) error.value = result.error ?? null
    isLoading.value = false
  }

  // Fetch departments with teacher assignments
  const fetchDepartments = async () => {
    const result = await DepartmentService.getAllWithTeachers()
    departments.value = result.data
  }

  // Create a teacher
  const createTeacher = async (form: TeacherForm) => {
    const result = await TeacherService.createFromForm(form)
    if (result.success && result.data?.id && form.department_id) {
      // Assign to department
      await updateTeacherDepartment(result.data.id, form.department_id, null)
    }
    if (result.success) {
      await fetchTeachers()
    }
    return result
  }

  // Update a teacher
  const updateTeacher = async (id: number, form: TeacherForm) => {
    const oldDeptId = TeacherService.getDepartmentId({ id } as Teacher, departments.value)
    const result = await TeacherService.updateFromForm(id, form)

    if (result.success) {
      // Update user status if teacher has an account
      if (form.user_id) {
        await UserService.updateStatus(form.user_id, form.is_active === 'Active')
      }

      // Update department assignment if changed
      if (form.department_id !== oldDeptId) {
        await updateTeacherDepartment(id, form.department_id, oldDeptId)
      }

      await fetchTeachers()
    }
    return result
  }

  // Update teacher's department assignment
  const updateTeacherDepartment = async (
    teacherId: number,
    newDeptId: number | null,
    oldDeptId: number | null,
  ) => {
    // Remove from old department
    if (oldDeptId && oldDeptId !== newDeptId) {
      const oldDept = departments.value.find(d => d.id === oldDeptId)
      if (oldDept) {
        await DepartmentService.removeTeacher(oldDeptId, teacherId, oldDept.teacher_id || [])
      }
    }

    // Add to new department
    if (newDeptId) {
      const newDept = departments.value.find(d => d.id === newDeptId)
      if (newDept) {
        await DepartmentService.addTeacher(newDeptId, teacherId, newDept.teacher_id || [])
      }
    }

    // Refresh departments
    await fetchDepartments()
  }

  // Check if teacher can be deleted
  const checkTeacherDeletion = async (teacher: Teacher): Promise<{ canDelete: boolean; classes: ClassItem[] }> => {
    const result = await ClassService.getByTeacher(teacher.id!)
    return {
      canDelete: result.data.length === 0,
      classes: result.data,
    }
  }

  // Delete a teacher
  const deleteTeacher = async (teacher: Teacher) => {
    // Delete user account first if exists
    if (teacher.user_id) {
      await UserService.deleteUser(teacher.user_id)
    }
    const result = await TeacherService.delete(teacher.id!)
    if (result.success) {
      await fetchTeachers()
    }
    return result
  }

  // Create accounts for deans
  const createDeanAccounts = async (deansToCreate: Teacher[]): Promise<AccountCredential[]> => {
    const credentials: AccountCredential[] = []

    for (const teacher of deansToCreate) {
      if (TeacherService.hasAccount(teacher) || !TeacherService.isDean(teacher) || !TeacherService.isActive(teacher)) {
        continue
      }

      const result = await UserService.createDeanAccount(
        teacher.id!,
        teacher.email,
        teacher.first_name,
        teacher.last_name,
        (teacherId, userId) => TeacherService.linkUserAccount(teacherId, userId),
      )

      if (result.success && result.data) {
        result.data.name = TeacherService.getFullName(teacher)
        credentials.push(result.data)
      }
    }

    if (credentials.length > 0) {
      await fetchTeachers()
    }

    return credentials
  }

  // Reset password for a teacher
  const resetPassword = async (teacher: Teacher): Promise<AccountCredential | null> => {
    if (!teacher.user_id) return null

    const password = UserService.generatePassword()
    const result = await UserService.resetPassword(teacher.user_id, password)

    if (result.success) {
      return {
        name: TeacherService.getFullName(teacher),
        email: teacher.email,
        password,
      }
    }

    return null
  }

  // Filter teachers
  const filterTeachers = (filters: {
    department?: number | null
    status?: string | null
    position?: string | null
  }) => {
    let result = teachers.value

    if (filters.department) {
      result = result.filter(t => TeacherService.isInDepartment(t, departments.value.find(d => d.id === filters.department)!))
    }
    if (filters.status) {
      result = result.filter(t => t.is_active === filters.status)
    }
    if (filters.position) {
      result = result.filter(t => t.position === filters.position)
    }

    return result
  }

  // Get department options
  const departmentOptions = computed(() => DepartmentService.toOptions(departments.value))

  // Get deans without accounts (only active)
  const deansWithoutAccounts = (selectedTeachers: Teacher[]) => {
    return selectedTeachers.filter(t => TeacherService.isDean(t) && !TeacherService.hasAccount(t) && TeacherService.isActive(t))
  }

  // Check if setting a teacher as Dean would conflict with existing Dean
  const checkDeanConflict = (departmentId: number, currentTeacherId?: number): Teacher | null => {
    const existingDean = TeacherService.findDepartmentDean(departmentId, teachers.value, departments.value)
    if (existingDean && existingDean.id !== currentTeacherId) {
      return existingDean
    }
    return null
  }

  return {
    // State
    teachers,
    departments,
    isLoading,
    error,
    // Actions
    fetchTeachers,
    fetchDepartments,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    checkTeacherDeletion,
    createDeanAccounts,
    resetPassword,
    filterTeachers,
    deansWithoutAccounts,
    checkDeanConflict,
    // Computed
    departmentOptions,
    // Static helpers
    getFullName: TeacherService.getFullName,
    hasAccount: TeacherService.hasAccount,
    isDean: TeacherService.isDean,
    isActive: TeacherService.isActive,
    getDepartmentNames: (teacher: Teacher) => TeacherService.getDepartmentNames(teacher, departments.value),
    getDepartmentId: (teacher: Teacher) => TeacherService.getDepartmentId(teacher, departments.value),
  }
}
