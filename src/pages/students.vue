<script setup lang="ts">
import { useStudents } from '@/composables/useStudents'
import type { AccountCredential, Student, StudentForm } from '@/types'
import { DEFAULT_GENDER, DEFAULT_STATUS, GENDER_OPTIONS, STATUS_OPTIONS, YEAR_LEVEL_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'students',
    allowedRoles: ['administrator'],
  },
})

// Use the students composable
const {
  students,
  departments,
  classes,
  isLoading,
  fetchStudents,
  fetchSupportingData,
  createStudent,
  updateStudent,
  deleteStudent,
  createAccounts,
  resetPassword,
  filterByStatus,
  studentsWithoutAccounts,
  departmentOptions,
  classOptions,
  getFullName,
  hasAccount,
  isActive,
  extractClassIds,
  getDepartmentId,
} = useStudents()

// Dialog state
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

// Form state
const form = ref<StudentForm>({
  student_number: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  gender: DEFAULT_GENDER,
  deparment_id: null,
  class_id: [],
  is_active: DEFAULT_STATUS,
  user_id: null,
  year_level: null,
})

// Filters
const search = ref('')
const statusFilter = ref<string | null>(null)

// Filtered students
const filteredStudents = computed(() => filterByStatus(statusFilter.value))

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

// Selected department computed with getter/setter
const selectedDepartment = computed({
  get: () => {
    if (!form.value.deparment_id) return null
    return departmentOptions.value.find(d => d.id === form.value.deparment_id) || null
  },
  set: (val) => {
    form.value.deparment_id = val?.id || null
    form.value.class_id = []
  },
})

// Get department display
const getDepartment = (student: Student): string => {
  if (!student.deparment_id) return ''

  if (typeof student.deparment_id === 'object' && student.deparment_id !== null) {
    const name = student.deparment_id.name
    if (typeof name === 'object' && name !== null) return name.programCode
    const dept = departments.value.find(d => d.id === (student.deparment_id as any).id)
    if (dept && typeof dept.name === 'object' && dept.name !== null) return dept.name.programCode
  }

  const deptId = typeof student.deparment_id === 'object' ? student.deparment_id.id : student.deparment_id
  const dept = departments.value.find(d => d.id === deptId)
  if (dept && typeof dept.name === 'object' && dept.name !== null) return dept.name.programCode

  return ''
}

// Get class names for a student
const getStudentClasses = (student: Student): string[] => {
  if (!student.class_id || !Array.isArray(student.class_id)) return []

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

// Reset form to default values
const resetForm = () => {
  form.value = {
    student_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    gender: DEFAULT_GENDER,
    deparment_id: null,
    class_id: [],
    is_active: DEFAULT_STATUS,
    user_id: null,
    year_level: null,
  }
}

// Open dialog for creating new student
const openCreateDialog = () => {
  isEditing.value = false
  resetForm()
  isDialogOpen.value = true
}

// Open dialog for editing student
const openEditDialog = (student: Student) => {
  isEditing.value = true
  form.value = {
    id: student.id,
    student_number: student.student_number,
    first_name: student.first_name,
    middle_name: student.middle_name || '',
    last_name: student.last_name,
    email: student.email,
    gender: student.gender,
    deparment_id: getDepartmentId(student),
    class_id: extractClassIds(student),
    is_active: student.is_active || DEFAULT_STATUS,
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

// Save student (create or update)
const saveStudent = async () => {
  if (isEditing.value && form.value.id) {
    await updateStudent(form.value.id, form.value)
  }
  else {
    await createStudent(form.value)
  }
  isDialogOpen.value = false
}

// Handle delete student
const handleDeleteStudent = async () => {
  if (!selectedStudent.value) return
  await deleteStudent(selectedStudent.value)
  isDeleteDialogOpen.value = false
  selectedStudent.value = null
}

// Handle create accounts
const handleCreateAccounts = async () => {
  const toCreate = studentsWithoutAccounts(selectedStudents.value)
  if (toCreate.length === 0) return

  isCreatingAccounts.value = true
  createdCredentials.value = await createAccounts(toCreate)
  selectedStudents.value = []
  isCreatingAccounts.value = false
  isAccountDialogOpen.value = true
}

// Confirm password reset
const confirmResetPassword = (student: Student) => {
  if (!student.user_id) return
  studentToReset.value = student
  isResetConfirmDialogOpen.value = true
}

// Handle password reset
const handleResetPassword = async () => {
  if (!studentToReset.value) return

  isResettingPassword.value = true
  isResetConfirmDialogOpen.value = false
  resetPasswordCredential.value = await resetPassword(studentToReset.value)
  isResettingPassword.value = false
  studentToReset.value = null
  if (resetPasswordCredential.value) {
    isResetPasswordDialogOpen.value = true
  }
}

// Clipboard and export helpers
const copyCredentials = () => {
  const text = createdCredentials.value
    .map(c => `${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`)
    .join('\n\n')
  navigator.clipboard.writeText(text)
}

const exportCredentials = () => {
  if (createdCredentials.value.length === 0) return
  const csvContent = [
    'Name,Email,Password',
    ...createdCredentials.value.map(c => `"${c.name}","${c.email}","${c.password}"`),
  ].join('\n')

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

const copySingleCredential = () => {
  if (!resetPasswordCredential.value) return
  const c = resetPasswordCredential.value
  navigator.clipboard.writeText(`${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`)
}

const exportSingleCredential = () => {
  if (!resetPasswordCredential.value) return
  const c = resetPasswordCredential.value
  const csvContent = `Name,Email,Password\n"${c.name}","${c.email}","${c.password}"`

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

// Computed for active students without accounts
const activeStudentsWithoutAccounts = computed(() => studentsWithoutAccounts(selectedStudents.value))

// Fetch data on mount
onMounted(() => {
  fetchStudents()
  fetchSupportingData()
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
          v-if="activeStudentsWithoutAccounts.length > 0"
          color="success"
          variant="outlined"
          prepend-icon="ri-user-add-line"
          class="me-4"
          :loading="isCreatingAccounts"
          @click="handleCreateAccounts"
        >
          Create Accounts ({{ activeStudentsWithoutAccounts.length }})
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
            {{ item.year_level }}
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
            <IconBtn size="small" @click="openEditDialog(item)">
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
            <IconBtn size="small" color="error" @click="openDeleteDialog(item)">
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
    <VDialog v-model="isDialogOpen" max-width="700" persistent>
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
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>{{ item.raw.title }}</template>
                    <template #subtitle>{{ item.raw.subtitle }}</template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="form.first_name" label="First Name" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="form.middle_name" label="Middle Name" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="form.last_name" label="Last Name" variant="outlined" />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="form.email" label="Email" type="email" variant="outlined" />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect v-model="form.gender" label="Gender" :items="GENDER_OPTIONS" variant="outlined" />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect v-model="form.is_active" label="Status" :items="STATUS_OPTIONS" variant="outlined" />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.year_level"
                label="Year Level"
                :items="YEAR_LEVEL_OPTIONS"
                item-title="title"
                item-value="value"
                variant="outlined"
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
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>{{ item.raw.title }}</template>
                    <template #subtitle>{{ item.raw.subtitle }}</template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDialogOpen = false">Cancel</VBtn>
          <VBtn
            color="primary"
            :disabled="!form.student_number || !form.first_name || !form.last_name || !form.email"
            @click="saveStudent"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog v-model="isDeleteDialogOpen" max-width="500">
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

          <VAlert v-if="selectedStudent?.user_id" type="warning" variant="tonal" class="mb-3">
            <template #title>User Account Will Be Deleted</template>
            This student has an associated user account that will be permanently deleted.
          </VAlert>

          <VAlert
            v-if="selectedStudent && getStudentClasses(selectedStudent).length > 0"
            type="info"
            variant="tonal"
            class="mb-3"
          >
            <template #title>Class Enrollments Will Be Removed</template>
            <ul class="mt-2 ps-4">
              <li v-for="className in getStudentClasses(selectedStudent)" :key="className">{{ className }}</li>
            </ul>
          </VAlert>

          <p class="text-error font-weight-medium mb-0">This action cannot be undone.</p>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeleteDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="handleDeleteStudent">Delete Student</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Account Credentials Dialog -->
    <VDialog v-model="isAccountDialogOpen" max-width="600">
      <VCard>
        <VCardTitle class="pa-6">Accounts Created Successfully</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          <VAlert type="warning" variant="tonal" class="mb-4">
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
          <VBtn variant="outlined" prepend-icon="ri-file-copy-line" @click="copyCredentials">Copy All</VBtn>
          <VBtn variant="outlined" prepend-icon="ri-download-line" @click="exportCredentials">Export CSV</VBtn>
          <VSpacer />
          <VBtn color="primary" @click="isAccountDialogOpen = false">Done</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Reset Password Confirmation Dialog -->
    <VDialog v-model="isResetConfirmDialogOpen" max-width="400">
      <VCard>
        <VCardTitle class="pa-6">Confirm Password Reset</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          <p class="mb-2">Are you sure you want to reset the password for:</p>
          <p class="font-weight-bold text-primary">{{ studentToReset ? getFullName(studentToReset) : '' }}</p>
          <p class="text-medium-emphasis mt-2">{{ studentToReset?.email }}</p>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isResetConfirmDialogOpen = false">Cancel</VBtn>
          <VBtn color="warning" :loading="isResettingPassword" @click="handleResetPassword">Reset Password</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Reset Password Success Dialog -->
    <VDialog v-model="isResetPasswordDialogOpen" max-width="450">
      <VCard>
        <VCardTitle class="pa-6">Password Reset Successfully</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          <VAlert type="warning" variant="tonal" class="mb-4">
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
          <VBtn variant="outlined" prepend-icon="ri-file-copy-line" @click="copySingleCredential">Copy</VBtn>
          <VBtn variant="outlined" prepend-icon="ri-download-line" @click="exportSingleCredential">Export CSV</VBtn>
          <VSpacer />
          <VBtn color="primary" @click="isResetPasswordDialogOpen = false">Done</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
