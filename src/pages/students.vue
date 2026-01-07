<script setup lang="ts">
import { $api } from '@/utils/api'
import { DEFAULT_GENDER, DEFAULT_STATUS, GENDER_OPTIONS, STATUS_OPTIONS, YEAR_LEVEL_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'students',
    allowedRoles: ['administrator'],
  },
})

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
}

interface ClassItem {
  id: number
  section: string
  course_id?: { courseCode: string } | number | null
}

interface Student {
  id?: number
  student_number: string
  first_name: string
  middle_name: string
  last_name: string
  email: string
  gender: string
  birthdate: string
  deparment_id: Department | number | null
  class_id?: any[]
  user_id?: string | null
  is_active?: string
  year_level?: string
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
const students = ref<Student[]>([])
const departments = ref<Department[]>([])
const classes = ref<ClassItem[]>([])
const roles = ref<Role[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedStudent = ref<Student | null>(null)

// Account creation state
const selectedStudents = ref<Student[]>([])
const isAccountDialogOpen = ref(false)
const isCreatingAccounts = ref(false)
const createdCredentials = ref<AccountCredential[]>([])

// Password reset state
const isResetPasswordDialogOpen = ref(false)
const isResetConfirmDialogOpen = ref(false)
const studentToReset = ref<Student | null>(null)
const resetPasswordCredential = ref<AccountCredential | null>(null)
const isResettingPassword = ref(false)

const form = ref({
  id: undefined as number | undefined,
  student_number: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  gender: DEFAULT_GENDER,
  birthdate: '',
  deparment_id: null as number | null,
  class_id: [] as number[],
  is_active: DEFAULT_STATUS as string,
  user_id: null as string | null,
  year_level: null as string | null,
})

const search = ref('')
const statusFilter = ref<string | null>(null)

// Filtered students by status
const filteredStudents = computed(() => {
  let result = students.value

  if (statusFilter.value)
    result = result.filter(student => student.is_active === statusFilter.value)

  return result
})

// Table headers
const headers = [
  { title: 'Student No.', key: 'student_number', sortable: true },
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Department', key: 'department', sortable: false },
  { title: 'Year', key: 'year_level', sortable: true },
  { title: 'Gender', key: 'gender', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Account', key: 'account', sortable: false, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get year level display
const getYearLevelDisplay = (yearLevel: string | undefined): string => {
  if (!yearLevel) return '-'
  return yearLevel
}

// Get student full name
const getFullName = (student: Student) => {
  const middle = student.middle_name ? ` ${student.middle_name}` : ''
  return `${student.last_name || ''}, ${student.first_name || ''}${middle}`
}

// Get department display
const getDepartment = (student: Student): string => {
  if (!student.deparment_id) return ''

  if (typeof student.deparment_id === 'object' && student.deparment_id !== null) {
    const name = student.deparment_id.name
    if (typeof name === 'object' && name !== null)
      return name.programCode

    // If name is just an ID, lookup from departments
    const dept = departments.value.find(d => d.id === student.deparment_id)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return dept.name.programCode
  }

  // If deparment_id is just a number
  const dept = departments.value.find(d => d.id === student.deparment_id)
  if (dept && typeof dept.name === 'object' && dept.name !== null)
    return dept.name.programCode

  return ''
}

// Department options for dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '',
    subtitle: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
  }))
})

// Selected department computed with getter/setter
const selectedDepartment = computed({
  get: () => {
    if (!form.value.deparment_id) return null
    return departmentOptions.value.find(d => d.id === form.value.deparment_id) || null
  },
  set: (val) => {
    form.value.deparment_id = val?.id || null
    // Clear class selection when department changes
    form.value.class_id = []
  },
})

// Class options filtered by selected department
const classOptions = computed(() => {
  return classes.value.map(cls => ({
    id: cls.id,
    title: cls.section,
    subtitle: typeof cls.course_id === 'object' && cls.course_id !== null ? cls.course_id.courseCode : '',
  }))
})

// Fetch students from Directus
const fetchStudents = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/students', {
      params: {
        fields: ['*', 'deparment_id.*', 'deparment_id.name.*', 'class_id.*'],
      },
    })

    students.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch students:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch departments
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
      },
    })

    departments.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

// Fetch classes
const fetchClasses = async () => {
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['id', 'section', 'course_id.courseCode', 'department_id'],
      },
    })

    classes.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
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

// Open dialog for creating new student
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    student_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    gender: DEFAULT_GENDER,
    birthdate: '',
    deparment_id: null,
    class_id: [],
    is_active: DEFAULT_STATUS,
    user_id: null,
    year_level: null,
  }
  isDialogOpen.value = true
}

// Open dialog for editing student
const openEditDialog = (student: Student) => {
  isEditing.value = true

  // Extract department ID
  let deptId: number | null = null
  if (student.deparment_id) {
    deptId = typeof student.deparment_id === 'object'
      ? student.deparment_id.id
      : student.deparment_id
  }

  // Extract class IDs from junction table
  const classIds = student.class_id
    ? student.class_id.map((c: any) => c.classes_id || c.id).filter(Boolean)
    : []

  form.value = {
    id: student.id,
    student_number: student.student_number,
    first_name: student.first_name,
    middle_name: student.middle_name || '',
    last_name: student.last_name,
    email: student.email,
    gender: student.gender,
    birthdate: student.birthdate || '',
    deparment_id: deptId,
    class_id: classIds,
    is_active: student.is_active,
    user_id: student.user_id || null,
    year_level: student.year_level || null,
  }

  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (student: Student) => {
  selectedStudent.value = student
  isDeleteDialogOpen.value = true
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

// Save student (create or update)
const saveStudent = async () => {
  try {
    const body: any = {
      student_number: form.value.student_number,
      first_name: form.value.first_name,
      middle_name: form.value.middle_name,
      last_name: form.value.last_name,
      email: form.value.email,
      gender: form.value.gender,
      birthdate: form.value.birthdate || null,
      deparment_id: form.value.deparment_id,
      is_active: form.value.is_active,
      year_level: form.value.year_level,
    }

    // Handle class_id - Directus M2M expects array of junction objects or IDs
    if (form.value.class_id.length > 0) {
      body.class_id = form.value.class_id.map(classId => ({ classes_id: classId }))
    }
    else {
      body.class_id = []
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/students/${form.value.id}`, {
        method: 'PATCH',
        body,
      })

      // Update user account status if student has an account
      if (form.value.user_id)
        await updateUserStatus(form.value.user_id, form.value.is_active)
    }
    else {
      await $api('/items/students', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchStudents()
  }
  catch (error) {
    console.error('Failed to save student:', error)
  }
}

// Get class names for a student
const getStudentClasses = (student: Student): string[] => {
  if (!student.class_id || !Array.isArray(student.class_id))
    return []

  return student.class_id.map((c: any) => {
    const classId = c.classes_id || c.id
    const cls = classes.value.find(cl => cl.id === classId)
    if (cls) {
      const courseCode = typeof cls.course_id === 'object' && cls.course_id !== null
        ? cls.course_id.courseCode
        : ''
      return courseCode ? `${cls.section} (${courseCode})` : cls.section
    }
    return ''
  }).filter(Boolean)
}

// Delete student
const deleteStudent = async () => {
  if (!selectedStudent.value?.id)
    return

  try {
    // Delete the Directus user account if exists
    if (selectedStudent.value.user_id) {
      try {
        await $api(`/users/${selectedStudent.value.user_id}`, {
          method: 'DELETE',
        })
      }
      catch (error) {
        console.error('Failed to delete user account:', error)
      }
    }

    // Delete the student record (junction table entries are automatically deleted)
    await $api(`/items/students/${selectedStudent.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedStudent.value = null
    await fetchStudents()
  }
  catch (error) {
    console.error('Failed to delete student:', error)
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

// Check if student has account
const hasAccount = (student: Student): boolean => {
  return !!student.user_id
}

// Check if student is active
const isActive = (student: Student): boolean => {
  return student.is_active === 'Active'
}

// Get students without accounts from selection (only Active students)
const studentsWithoutAccounts = computed(() => {
  return selectedStudents.value.filter(s => !hasAccount(s) && isActive(s))
})

// Create accounts for selected students
const createAccounts = async () => {
  if (studentsWithoutAccounts.value.length === 0)
    return

  const studentRoleId = getRoleId('student')
  if (!studentRoleId) {
    console.error('Student role not found. Please create a "student" role in Directus.')
    return
  }

  isCreatingAccounts.value = true
  createdCredentials.value = []

  try {
    for (const student of studentsWithoutAccounts.value) {
      const password = generatePassword()

      // Create Directus user
      const userRes = await $api('/users', {
        method: 'POST',
        body: {
          email: student.email,
          password,
          first_name: student.first_name,
          last_name: student.last_name,
          role: studentRoleId,
        },
      })

      if (userRes?.data?.id) {
        // Link user to student record
        await $api(`/items/students/${student.id}`, {
          method: 'PATCH',
          body: { user_id: userRes.data.id },
        })

        createdCredentials.value.push({
          name: getFullName(student),
          email: student.email,
          password,
        })
      }
    }

    await fetchStudents()
    selectedStudents.value = []
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
  link.download = `student_accounts_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Open confirmation dialog before resetting password
const confirmResetPassword = (student: Student) => {
  if (!student.user_id) return
  studentToReset.value = student
  isResetConfirmDialogOpen.value = true
}

// Reset password for a student after confirmation
const resetPassword = async () => {
  if (!studentToReset.value?.user_id) return

  isResettingPassword.value = true
  isResetConfirmDialogOpen.value = false

  try {
    const password = generatePassword()

    await $api(`/users/${studentToReset.value.user_id}`, {
      method: 'PATCH',
      body: { password },
    })

    resetPasswordCredential.value = {
      name: getFullName(studentToReset.value),
      email: studentToReset.value.email,
      password,
    }
    isResetPasswordDialogOpen.value = true
  }
  catch (error) {
    console.error('Failed to reset password:', error)
  }
  finally {
    isResettingPassword.value = false
    studentToReset.value = null
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
  fetchStudents()
  fetchDepartments()
  fetchClasses()
  fetchRoles()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Student Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search students..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
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
        <VBtn
          v-if="studentsWithoutAccounts.length > 0"
          color="success"
          variant="outlined"
          prepend-icon="ri-user-add-line"
          class="me-4"
          :loading="isCreatingAccounts"
          @click="createAccounts"
        >
          Create Accounts ({{ studentsWithoutAccounts.length }})
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Student
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        v-model="selectedStudents"
        :headers="headers"
        :items="filteredStudents"
        :search="search"
        :loading="isLoading"
        show-select
        item-value="id"
        return-object
        hover
      >
        <template #item.student_number="{ item }">
          <span class="font-weight-medium">{{ item.student_number }}</span>
        </template>

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
            <div>
              <span class="font-weight-medium">{{ getFullName(item) }}</span>
              <div class="text-caption text-medium-emphasis">{{ item.email }}</div>
            </div>
          </div>
        </template>

        <template #item.department="{ item }">
          <span v-if="getDepartment(item)">{{ getDepartment(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.year_level="{ item }">
          <VChip
            v-if="item.year_level"
            size="small"
            variant="tonal"
            color="info"
          >
            {{ getYearLevelDisplay(item.year_level) }}
          </VChip>
          <span v-else class="text-medium-emphasis">-</span>
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
            <p class="text-body-1 text-medium-emphasis">No students found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="700"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Student' : 'Add New Student' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.student_number"
                label="Student Number"
                placeholder="e.g., A2021-000001"
                variant="outlined"
                :rules="[v => !!v || 'Student number is required']"
              />
            </VCol>
            <VCol cols="12" md="8">
              <VSelect
                v-model="selectedDepartment"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                return-object
                variant="outlined"
                placeholder="Select department..."
                :rules="[v => !!v || 'Department is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
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
              <VTextField
                v-model="form.email"
                label="Email"
                placeholder="Enter email address"
                type="email"
                variant="outlined"
                :rules="[v => !!v || 'Email is required', v => /.+@.+\..+/.test(v) || 'Email must be valid']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="form.birthdate"
                label="Birthdate"
                type="date"
                variant="outlined"
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
                v-model="form.year_level"
                label="Year Level"
                :items="YEAR_LEVEL_OPTIONS"
                item-title="title"
                item-value="value"
                variant="outlined"
                placeholder="Select year level..."
              />
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.class_id"
                label="Enrolled Classes"
                :items="classOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                multiple
                chips
                closable-chips
                placeholder="Select classes..."
                hint="Select the classes this student is enrolled in"
                persistent-hint
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
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
            :disabled="!form.student_number || !form.first_name || !form.last_name || !form.email || !form.gender || !form.deparment_id"
            @click="saveStudent"
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
          Delete Student
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <p class="mb-4">
            Are you sure you want to delete <strong>{{ selectedStudent ? getFullName(selectedStudent) : '' }}</strong>?
          </p>

          <!-- Warning for user account -->
          <VAlert
            v-if="selectedStudent?.user_id"
            type="warning"
            variant="tonal"
            class="mb-3"
          >
            <template #title>
              User Account Will Be Deleted
            </template>
            This student has an associated user account. The account will be permanently deleted and they will no longer be able to log in.
          </VAlert>

          <!-- Warning for class enrollments -->
          <VAlert
            v-if="selectedStudent && getStudentClasses(selectedStudent).length > 0"
            type="info"
            variant="tonal"
            class="mb-3"
          >
            <template #title>
              Class Enrollments Will Be Removed
            </template>
            <div>
              This student will be removed from the following classes:
              <ul class="mt-2 ps-4">
                <li v-for="className in getStudentClasses(selectedStudent)" :key="className">
                  {{ className }}
                </li>
              </ul>
            </div>
          </VAlert>

          <p class="text-error font-weight-medium mb-0">
            This action cannot be undone.
          </p>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            @click="deleteStudent"
          >
            Delete Student
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
          <p class="font-weight-bold text-primary">{{ studentToReset ? getFullName(studentToReset) : '' }}</p>
          <p class="text-medium-emphasis mt-2">{{ studentToReset?.email }}</p>
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
