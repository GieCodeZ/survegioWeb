<script setup lang="ts">
import { $api } from '@/utils/api'
import { DEFAULT_GENDER, DEFAULT_STATUS, GENDER_OPTIONS, STATUS_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'teachers',
    allowedRoles: ['administrator'],
  },
})

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
  teacher_id?: any[]
}

interface Teacher {
  id?: number
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

interface AccountCredential {
  name: string
  email: string
  password: string
}

interface Role {
  id: string
  name: string
}

// State
const teachers = ref<Teacher[]>([])
const departments = ref<Department[]>([])
const roles = ref<Role[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedTeacher = ref<Teacher | null>(null)

// Account creation state
const selectedTeachers = ref<Teacher[]>([])
const isAccountDialogOpen = ref(false)
const isCreatingAccounts = ref(false)
const createdCredentials = ref<AccountCredential[]>([])

// Password reset state
const isResetPasswordDialogOpen = ref(false)
const isResetConfirmDialogOpen = ref(false)
const teacherToReset = ref<Teacher | null>(null)
const resetPasswordCredential = ref<AccountCredential | null>(null)
const isResettingPassword = ref(false)

const form = ref({
  id: undefined as number | undefined,
  first_name: '',
  middle_name: '',
  last_name: '',
  position: '',
  gender: DEFAULT_GENDER,
  email: '',
  Department: null as number[] | null,
  department_id: null as number | null,
  is_active: DEFAULT_STATUS as string,
  user_id: null as string | null,
})

const search = ref('')
const departmentFilter = ref<number | null>(null)
const statusFilter = ref<string | null>(null)
const positionFilter = ref<string | null>(null)

// Position options
const POSITION_OPTIONS = ['Dean', 'Professor']

// Department options for filter dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '',
  }))
})

// Check if teacher belongs to a specific department
const isTeacherInDepartment = (teacher: Teacher, deptId: number): boolean => {
  if (!teacher.id)
    return false

  const dept = departments.value.find(d => d.id === deptId)
  if (!dept)
    return false

  const teacherIds = dept.teacher_id || []
  return teacherIds.some((t: any) => {
    // Prioritize Teachers_id (the actual teacher ID from junction table)
    const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
    return tId === teacher.id
  })
}

// Get the existing Dean for a department (returns teacher ID or null)
const getDepartmentDean = (deptId: number): Teacher | null => {
  const dept = departments.value.find(d => d.id === deptId)
  if (!dept) return null

  const teacherIds = dept.teacher_id || []

  for (const t of teacherIds) {
    const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
    const teacher = teachers.value.find(teach => teach.id === tId)
    if (teacher && teacher.position === 'Dean') {
      return teacher
    }
  }

  return null
}

// Check if trying to set Dean position when department already has one
const existingDeanInDepartment = computed(() => {
  // Only check if position is Dean and a department is selected
  if (form.value.position !== 'Dean' || !form.value.department_id) {
    return null
  }

  const existingDean = getDepartmentDean(form.value.department_id)

  // If editing and the current teacher is already the Dean, allow it
  if (existingDean && isEditing.value && form.value.id === existingDean.id) {
    return null
  }

  return existingDean
})

// Get department name by ID
const getDepartmentName = (deptId: number): string => {
  const dept = departments.value.find(d => d.id === deptId)
  if (dept && typeof dept.name === 'object' && dept.name !== null) {
    return dept.name.programCode || dept.name.programName || ''
  }
  return ''
}

// Filtered teachers by department, status, and position
const filteredTeachers = computed(() => {
  let result = teachers.value

  if (departmentFilter.value)
    result = result.filter(teacher => isTeacherInDepartment(teacher, departmentFilter.value!))

  if (statusFilter.value)
    result = result.filter(teacher => teacher.is_active === statusFilter.value)

  if (positionFilter.value)
    result = result.filter(teacher => teacher.position === positionFilter.value)

  return result
})

// Table headers
const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Position', key: 'position', sortable: true },
  { title: 'Department', key: 'department', sortable: false },
  { title: 'Gender', key: 'gender', sortable: true },
  { title: 'Email', key: 'email', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Account', key: 'account', sortable: false, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get teacher full name
const getFullName = (teacher: Teacher) => {
  const middle = teacher.middle_name ? ` ${teacher.middle_name}` : ''

  return `${teacher.last_name || ''}, ${teacher.first_name || ''}${middle}`
}

// Get department name for a teacher - lookup by checking if teacher is in department's teacher_id
const getTeacherDepartments = (teacher: Teacher): string[] => {
  if (!teacher.id)
    return []

  const deptNames: string[] = []

  for (const dept of departments.value) {
    // Check if teacher is assigned to this department
    const teacherIds = dept.teacher_id || []
    const isAssigned = teacherIds.some((t: any) => {
      // Prioritize Teachers_id (the actual teacher ID from junction table)
      const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
      return tId === teacher.id
    })

    if (isAssigned && dept.name) {
      if (typeof dept.name === 'object' && dept.name !== null) {
        deptNames.push(dept.name.programCode || dept.name.programName)
      }
    }
  }

  return deptNames
}

// Fetch teachers from Directus
const fetchTeachers = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/Teachers', {
      params: {
        fields: ['*'],
        sort: 'last_name',
      },
    })

    teachers.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch departments from Directus
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode', 'teacher_id.id', 'teacher_id.Teachers_id'],
      },
    })

    departments.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

// Fetch roles
const fetchRoles = async () => {
  try {
    const res = await $api('/roles', {
      params: {
        fields: ['id', 'name'],
      },
    })

    roles.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch roles:', error)
  }
}

// Get role ID by name
const getRoleId = (roleName: string): string | null => {
  const role = roles.value.find(r => r.name.toLowerCase() === roleName.toLowerCase())
  return role?.id
}

// Open dialog for creating new teacher
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    first_name: '',
    middle_name: '',
    last_name: '',
    position: '',
    gender: DEFAULT_GENDER,
    email: '',
    Department: null,
    department_id: null,
    is_active: DEFAULT_STATUS,
    user_id: null,
  }
  isDialogOpen.value = true
}

// Get the first department ID for a teacher (for editing)
const getTeacherDepartmentId = (teacher: Teacher): number | null => {
  if (!teacher.id) return null

  for (const dept of departments.value) {
    const teacherIds = dept.teacher_id || []
    const isAssigned = teacherIds.some((t: any) => {
      const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
      return tId === teacher.id
    })

    if (isAssigned) {
      return dept.id
    }
  }

  return null
}

// Open dialog for editing teacher
const openEditDialog = (teacher: Teacher) => {
  isEditing.value = true

  // Get the teacher's current department from the junction table
  const currentDeptId = getTeacherDepartmentId(teacher)

  form.value = {
    id: teacher.id,
    first_name: teacher.first_name,
    middle_name: teacher.middle_name || '',
    last_name: teacher.last_name,
    position: teacher.position,
    gender: teacher.gender,
    email: teacher.email,
    Department: teacher.Department || null,
    department_id: currentDeptId,
    is_active: teacher.is_active,
    user_id: teacher.user_id || null,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = async (teacher: Teacher) => {
  selectedTeacher.value = teacher
  isDeleteDialogOpen.value = true
  await checkTeacherDeletion(teacher)
}

// Update Directus user status based on is_active
const updateUserStatus = async (userId: string, isActive: string) => {
  if (!userId)
    return

  try {
    // In Directus, user status: 'active' = can login, 'suspended' = cannot login
    const userStatus = isActive === 'Active' ? 'active' : 'suspended'

    await $api(`/users/${userId}`, {
      method: 'PATCH',
      body: { status: userStatus },
    })
  }
  catch (error) {
    console.error('Failed to update user status:', error)
  }
}

// Update teacher's department assignment (M2M via Department.teacher_id)
const updateTeacherDepartment = async (teacherId: number, newDeptId: number | null, oldDeptId: number | null) => {
  try {
    // Remove from old department if changing
    if (oldDeptId && oldDeptId !== newDeptId) {
      const oldDept = departments.value.find(d => d.id === oldDeptId)
      if (oldDept) {
        // Get current teacher_id entries, excluding the current teacher
        const updatedTeacherIds = (oldDept.teacher_id || [])
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

        await $api(`/items/Department/${oldDeptId}`, {
          method: 'PATCH',
          body: { teacher_id: updatedTeacherIds },
        })
      }
    }

    // Add to new department
    if (newDeptId) {
      const newDept = departments.value.find(d => d.id === newDeptId)
      if (newDept) {
        // Check if already in this department
        const alreadyAssigned = (newDept.teacher_id || []).some((t: any) => {
          const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
          return tId === teacherId
        })

        if (!alreadyAssigned) {
          // Preserve existing entries and add new one
          const updatedTeacherIds = [
            ...(newDept.teacher_id || []).map((t: any) => {
              if (typeof t === 'object' && t.id) {
                return { id: t.id, Teachers_id: t.Teachers_id }
              }
              return { Teachers_id: typeof t === 'number' ? t : t.Teachers_id }
            }),
            { Teachers_id: teacherId },
          ]

          await $api(`/items/Department/${newDeptId}`, {
            method: 'PATCH',
            body: { teacher_id: updatedTeacherIds },
          })
        }
      }
    }

    // Refresh departments to update the local state
    await fetchDepartments()
  }
  catch (error) {
    console.error('Failed to update teacher department:', error)
  }
}

// Save teacher (create or update)
const saveTeacher = async () => {
  try {
    const body: any = {
      first_name: form.value.first_name,
      middle_name: form.value.middle_name,
      last_name: form.value.last_name,
      position: form.value.position,
      gender: form.value.gender,
      email: form.value.email,
      is_active: form.value.is_active,
    }

    let teacherId: number | undefined

    if (isEditing.value && form.value.id) {
      teacherId = form.value.id

      // Get the old department before updating
      const oldDeptId = getTeacherDepartmentId({ id: teacherId } as Teacher)

      // Update existing teacher
      await $api(`/items/Teachers/${form.value.id}`, {
        method: 'PATCH',
        body,
      })

      // Update user account status if teacher has an account
      if (form.value.user_id)
        await updateUserStatus(form.value.user_id, form.value.is_active)

      // Update department assignment if changed
      if (form.value.department_id !== oldDeptId) {
        await updateTeacherDepartment(teacherId, form.value.department_id, oldDeptId)
      }
    }
    else {
      // Create new teacher
      const res = await $api('/items/Teachers', {
        method: 'POST',
        body,
      })
      teacherId = res.data.id

      // Assign to department if selected
      if (form.value.department_id && teacherId) {
        await updateTeacherDepartment(teacherId, form.value.department_id, null)
      }
    }

    isDialogOpen.value = false
    await fetchTeachers()
  }
  catch (error) {
    console.error('Failed to save teacher:', error)
  }
}

// State for deletion checks
const isCheckingDeletion = ref(false)
const deletionBlockedReason = ref<string | null>(null)
const teacherClasses = ref<any[]>([])

// Check if teacher can be deleted
const checkTeacherDeletion = async (teacher: Teacher) => {
  isCheckingDeletion.value = true
  deletionBlockedReason.value = null
  teacherClasses.value = []

  try {
    // Check if teacher is assigned to any classes
    const classesRes = await $api('/items/classes', {
      params: {
        filter: { teacher_id: { _eq: teacher.id } },
        fields: ['id', 'section', 'course_id.courseCode', 'acadTerm_id.schoolYear', 'acadTerm_id.semester'],
      },
    })

    if (classesRes.data && classesRes.data.length > 0) {
      teacherClasses.value = classesRes.data
      deletionBlockedReason.value = 'classes'
    }
  }
  catch (error) {
    console.error('Failed to check teacher deletion:', error)
  }
  finally {
    isCheckingDeletion.value = false
  }
}

// Delete teacher
const deleteTeacher = async () => {
  if (!selectedTeacher.value?.id)
    return

  // Don't allow deletion if teacher has classes
  if (deletionBlockedReason.value === 'classes') {
    return
  }

  try {
    // Delete the Directus user account if exists (like students)
    if (selectedTeacher.value.user_id) {
      try {
        await $api(`/users/${selectedTeacher.value.user_id}`, {
          method: 'DELETE',
        })
      }
      catch (error) {
        console.error('Failed to delete user account:', error)
      }
    }

    // Delete the teacher record
    await $api(`/items/Teachers/${selectedTeacher.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedTeacher.value = null
    deletionBlockedReason.value = null
    teacherClasses.value = []
    await fetchTeachers()
  }
  catch (error) {
    console.error('Failed to delete teacher:', error)
  }
}

// Generate random password
const generatePassword = (length = 12): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
  let password = ''
  for (let i = 0; i < length; i++)
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  return password
}

// Check if teacher has account
const hasAccount = (teacher: Teacher): boolean => {
  return !!teacher.user_id
}

// Check if teacher is a Dean
const isDean = (teacher: Teacher): boolean => {
  return teacher.position?.toLowerCase() === 'dean'
}

// Check if teacher is active
const isActive = (teacher: Teacher): boolean => {
  return teacher.is_active === 'Active'
}

// Get deans without accounts from selection (only Active deans)
const deansWithoutAccounts = computed(() => {
  return selectedTeachers.value.filter(t => isDean(t) && !hasAccount(t) && isActive(t))
})

// Create accounts for selected deans
const createAccounts = async () => {
  if (deansWithoutAccounts.value.length === 0)
    return

  const deanRoleId = getRoleId('dean')
  if (!deanRoleId) {
    console.error('Dean role not found. Please create a "dean" role in Directus.')
    return
  }

  isCreatingAccounts.value = true
  createdCredentials.value = []

  try {
    for (const teacher of deansWithoutAccounts.value) {
      const password = generatePassword()

      // Create Directus user with dean role
      const userRes = await $api('/users', {
        method: 'POST',
        body: {
          email: teacher.email,
          password,
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          role: deanRoleId,
        },
      })

      if (userRes?.data?.id) {
        // Link user to teacher record
        await $api(`/items/Teachers/${teacher.id}`, {
          method: 'PATCH',
          body: { user_id: userRes.data.id },
        })

        createdCredentials.value.push({
          name: getFullName(teacher),
          email: teacher.email,
          password,
        })
      }
    }

    await fetchTeachers()
    selectedTeachers.value = []
    isAccountDialogOpen.value = true
  }
  catch (error) {
    console.error('Failed to create accounts:', error)
  }
  finally {
    isCreatingAccounts.value = false
  }
}

// Copy credentials to clipboard
const copyCredentials = () => {
  const text = createdCredentials.value
    .map(c => `${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`)
    .join('\n\n')
  navigator.clipboard.writeText(text)
}

// Export credentials to CSV
const exportCredentials = () => {
  if (createdCredentials.value.length === 0) return

  // Create CSV content
  const headers = ['Name', 'Email', 'Password']
  const rows = createdCredentials.value.map(c => [
    `"${c.name}"`,
    `"${c.email}"`,
    `"${c.password}"`,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `teacher_accounts_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Open confirmation dialog before resetting password
const confirmResetPassword = (teacher: Teacher) => {
  if (!teacher.user_id) return
  teacherToReset.value = teacher
  isResetConfirmDialogOpen.value = true
}

// Reset password for a teacher (dean) after confirmation
const resetPassword = async () => {
  if (!teacherToReset.value?.user_id) return

  isResettingPassword.value = true
  isResetConfirmDialogOpen.value = false

  try {
    const password = generatePassword()

    await $api(`/users/${teacherToReset.value.user_id}`, {
      method: 'PATCH',
      body: { password },
    })

    resetPasswordCredential.value = {
      name: getFullName(teacherToReset.value),
      email: teacherToReset.value.email,
      password,
    }
    isResetPasswordDialogOpen.value = true
  }
  catch (error) {
    console.error('Failed to reset password:', error)
  }
  finally {
    isResettingPassword.value = false
    teacherToReset.value = null
  }
}

// Copy single credential to clipboard
const copySingleCredential = () => {
  if (!resetPasswordCredential.value) return
  const c = resetPasswordCredential.value
  const text = `${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`
  navigator.clipboard.writeText(text)
}

// Export single credential to CSV
const exportSingleCredential = () => {
  if (!resetPasswordCredential.value) return
  const c = resetPasswordCredential.value

  const csvContent = [
    'Name,Email,Password',
    `"${c.name}","${c.email}","${c.password}"`,
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `password_reset_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Fetch data on mount
onMounted(() => {
  fetchTeachers()
  fetchDepartments()
  fetchRoles()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Teacher Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search teachers..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VSelect
          v-model="departmentFilter"
          :items="departmentOptions"
          item-title="title"
          item-value="id"
          label="Department"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 180px;"
        />
        <VSelect
          v-model="statusFilter"
          :items="STATUS_OPTIONS"
          label="Status"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 150px;"
        />
        <VSelect
          v-model="positionFilter"
          :items="POSITION_OPTIONS"
          label="Position"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 150px;"
        />
        <VBtn
          v-if="deansWithoutAccounts.length > 0"
          color="success"
          variant="outlined"
          prepend-icon="ri-user-add-line"
          class="me-4"
          :loading="isCreatingAccounts"
          @click="createAccounts"
        >
          Create Accounts ({{ deansWithoutAccounts.length }})
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Teacher
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        v-model="selectedTeachers"
        :headers="headers"
        :items="filteredTeachers"
        :search="search"
        :loading="isLoading"
        show-select
        item-value="id"
        return-object
        hover
      >
        <template #item.name="{ item }">
          <div class="d-flex align-center gap-3">
            <VAvatar
              size="36"
              :color="item.gender === 'M' ? 'primary' : 'pink'"
              variant="tonal"
            >
              <span class="text-body-1 font-weight-medium">
                {{ (item.first_name || '').charAt(0) }}{{ (item.last_name || '').charAt(0) }}
              </span>
            </VAvatar>
            <span class="font-weight-medium">{{ getFullName(item) }}</span>
          </div>
        </template>

        <template #item.position="{ item }">
          <span>{{ item.position }}</span>
        </template>

        <template #item.department="{ item }">
          <span v-if="getTeacherDepartments(item).length > 0">
            {{ getTeacherDepartments(item).join(', ') }}
          </span>
          <span v-else class="text-medium-emphasis">Not assigned</span>
        </template>

        <template #item.gender="{ item }">
          <span>{{ item.gender }}</span>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="item.is_active === 'Active' ? 'success' : item.is_active === 'Draft' ? 'warning' : 'error'"
            size="small"
            variant="tonal"
          >
            {{ item.is_active || 'N/A' }}
          </VChip>
        </template>

        <template #item.account="{ item }">
          <template v-if="isDean(item)">
            <VIcon
              v-if="hasAccount(item)"
              icon="ri-checkbox-circle-fill"
              color="success"
              size="20"
            />
            <VIcon
              v-else
              icon="ri-close-circle-line"
              color="error"
              size="20"
            />
          </template>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              v-if="hasAccount(item)"
              size="small"
              color="warning"
              :loading="isResettingPassword"
              @click="confirmResetPassword(item)"
            >
              <VIcon icon="ri-lock-password-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No teachers found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="600"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Teacher' : 'Add New Teacher' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.first_name"
                label="First Name"
                placeholder="Enter first name"
                variant="outlined"
                :rules="[v => !!v || 'First name is required']"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.middle_name"
                label="Middle Name"
                placeholder="Enter middle name"
                variant="outlined"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.last_name"
                label="Last Name"
                placeholder="Enter last name"
                variant="outlined"
                :rules="[v => !!v || 'Last name is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.position"
                label="Position"
                :items="POSITION_OPTIONS"
                variant="outlined"
                :rules="[v => !!v || 'Position is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.gender"
                label="Gender"
                :items="GENDER_OPTIONS"
                variant="outlined"
                :rules="[v => !!v || 'Gender is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.is_active"
                label="Status"
                :items="STATUS_OPTIONS"
                variant="outlined"
                :rules="[v => !!v || 'Status is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.department_id"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select department..."
                clearable
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="form.email"
                label="Email"
                placeholder="Enter email address (optional)"
                type="email"
                variant="outlined"
                :rules="[v => !v || /.+@.+\..+/.test(v) || 'Email must be valid']"
              />
            </VCol>
            <VCol v-if="existingDeanInDepartment" cols="12">
              <VAlert
                type="error"
                variant="tonal"
                density="compact"
              >
                <template #title>
                  Cannot assign Dean position
                </template>
                The {{ getDepartmentName(form.department_id!) }} department already has a Dean: <strong>{{ existingDeanInDepartment.last_name }}, {{ existingDeanInDepartment.first_name }}</strong>. Each department can only have one Dean.
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!form.first_name || !form.last_name || !form.position || !form.gender || !!existingDeanInDepartment"
            @click="saveTeacher"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="500"
    >
      <VCard>
        <VCardTitle class="pa-6 d-flex align-center gap-2">
          <VIcon icon="ri-error-warning-line" color="error" />
          Delete Teacher
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Loading state -->
          <div v-if="isCheckingDeletion" class="d-flex justify-center pa-4">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <!-- Blocked: Teacher has classes -->
            <template v-if="deletionBlockedReason === 'classes'">
              <VAlert
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <template #title>
                  Cannot Delete Teacher
                </template>
                This teacher is currently assigned to {{ teacherClasses.length }} class(es). Please reassign or remove them from all classes before deleting.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Assigned Classes:</p>
              <VList density="compact" class="mb-4">
                <VListItem
                  v-for="cls in teacherClasses"
                  :key="cls.id"
                  density="compact"
                >
                  <template #prepend>
                    <VIcon icon="ri-book-line" size="small" />
                  </template>
                  <VListItemTitle>
                    {{ cls.course_id?.courseCode || 'Unknown Course' }} - Section {{ cls.section }}
                  </VListItemTitle>
                  <VListItemSubtitle>
                    {{ cls.acadTerm_id?.schoolYear }} {{ cls.acadTerm_id?.semester }}
                  </VListItemSubtitle>
                </VListItem>
              </VList>
            </template>

            <!-- Can delete -->
            <template v-else>
              <p class="mb-4">
                Are you sure you want to delete <strong>{{ selectedTeacher ? getFullName(selectedTeacher) : '' }}</strong>?
              </p>

              <!-- Warning for user account -->
              <VAlert
                v-if="selectedTeacher?.user_id"
                type="warning"
                variant="tonal"
                class="mb-3"
              >
                <template #title>
                  User Account Will Be Deleted
                </template>
                This teacher has an associated user account. The account will be permanently deleted and they will no longer be able to log in.
              </VAlert>

              <p class="text-error font-weight-medium mb-0">
                This action cannot be undone.
              </p>
            </template>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            {{ deletionBlockedReason ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="!deletionBlockedReason && !isCheckingDeletion"
            color="error"
            @click="deleteTeacher"
          >
            Delete Teacher
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Account Credentials Dialog -->
    <VDialog
      v-model="isAccountDialogOpen"
      max-width="600"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Accounts Created Successfully
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            Please save these credentials. Passwords cannot be retrieved later.
          </VAlert>

          <VTable density="compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Password</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cred in createdCredentials" :key="cred.email">
                <td>{{ cred.name }}</td>
                <td>{{ cred.email }}</td>
                <td class="font-weight-medium">{{ cred.password }}</td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VBtn
            variant="outlined"
            prepend-icon="ri-file-copy-line"
            @click="copyCredentials"
          >
            Copy All
          </VBtn>
          <VBtn
            variant="outlined"
            prepend-icon="ri-download-line"
            @click="exportCredentials"
          >
            Export CSV
          </VBtn>
          <VSpacer />
          <VBtn
            color="primary"
            @click="isAccountDialogOpen = false"
          >
            Done
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Reset Password Confirmation Dialog -->
    <VDialog
      v-model="isResetConfirmDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Confirm Password Reset
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <p class="mb-2">Are you sure you want to reset the password for:</p>
          <p class="font-weight-bold text-primary">{{ teacherToReset ? getFullName(teacherToReset) : '' }}</p>
          <p class="text-medium-emphasis mt-2">{{ teacherToReset?.email }}</p>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isResetConfirmDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="warning"
            :loading="isResettingPassword"
            @click="resetPassword"
          >
            Reset Password
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Reset Password Success Dialog -->
    <VDialog
      v-model="isResetPasswordDialogOpen"
      max-width="450"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Password Reset Successfully
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            Please save this password. It cannot be retrieved later.
          </VAlert>

          <div v-if="resetPasswordCredential" class="d-flex flex-column gap-2">
            <div>
              <span class="text-medium-emphasis">Name:</span>
              <span class="font-weight-medium ms-2">{{ resetPasswordCredential.name }}</span>
            </div>
            <div>
              <span class="text-medium-emphasis">Email:</span>
              <span class="font-weight-medium ms-2">{{ resetPasswordCredential.email }}</span>
            </div>
            <div>
              <span class="text-medium-emphasis">New Password:</span>
              <span class="font-weight-bold ms-2 text-primary">{{ resetPasswordCredential.password }}</span>
            </div>
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VBtn
            variant="outlined"
            prepend-icon="ri-file-copy-line"
            @click="copySingleCredential"
          >
            Copy
          </VBtn>
          <VBtn
            variant="outlined"
            prepend-icon="ri-download-line"
            @click="exportSingleCredential"
          >
            Export CSV
          </VBtn>
          <VSpacer />
          <VBtn
            color="primary"
            @click="isResetPasswordDialogOpen = false"
          >
            Done
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
