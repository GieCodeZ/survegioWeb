<script setup lang="ts">
import { useTeachers } from '@/composables/useTeachers'
import type { AccountCredential, ClassItem, Teacher, TeacherForm } from '@/types'
import { DEFAULT_GENDER, DEFAULT_STATUS, GENDER_OPTIONS, STATUS_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'teachers',
    allowedRoles: ['administrator'],
  },
})

// Use the teachers composable
const {
  teachers,
  departments,
  isLoading,
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
  departmentOptions,
  getFullName,
  hasAccount,
  isDean,
  isActive,
  getDepartmentNames,
  getDepartmentId,
} = useTeachers()

// Position options
const POSITION_OPTIONS = ['Dean', 'Professor']

// Dialog state
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

// Deletion state
const isCheckingDeletion = ref(false)
const deletionBlockedReason = ref<string | null>(null)
const teacherClasses = ref<ClassItem[]>([])

// Form state
const form = ref<TeacherForm>({
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
})

// Filters
const search = ref('')
const departmentFilter = ref<number | null>(null)
const statusFilter = ref<string | null>(null)
const positionFilter = ref<string | null>(null)

// Filtered teachers
const filteredTeachers = computed(() => filterTeachers({
  department: departmentFilter.value,
  status: statusFilter.value,
  position: positionFilter.value,
}))

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

// Check if Dean position conflicts with existing Dean
const existingDeanInDepartment = computed(() => {
  if (form.value.position !== 'Dean' || !form.value.department_id) {
    return null
  }
  return checkDeanConflict(form.value.department_id, form.value.id)
})

// Get department name by ID
const getDepartmentName = (deptId: number): string => {
  const dept = departments.value.find(d => d.id === deptId)
  if (dept && typeof dept.name === 'object' && dept.name !== null) {
    return dept.name.programCode || dept.name.programName || ''
  }
  return ''
}

// Reset form to default values
const resetForm = () => {
  form.value = {
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
}

// Open dialog for creating new teacher
const openCreateDialog = () => {
  isEditing.value = false
  resetForm()
  isDialogOpen.value = true
}

// Open dialog for editing teacher
const openEditDialog = (teacher: Teacher) => {
  isEditing.value = true
  form.value = {
    id: teacher.id,
    first_name: teacher.first_name,
    middle_name: teacher.middle_name || '',
    last_name: teacher.last_name,
    position: teacher.position,
    gender: teacher.gender,
    email: teacher.email,
    Department: teacher.Department || null,
    department_id: getDepartmentId(teacher),
    is_active: teacher.is_active || DEFAULT_STATUS,
    user_id: teacher.user_id || null,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = async (teacher: Teacher) => {
  selectedTeacher.value = teacher
  isDeleteDialogOpen.value = true
  isCheckingDeletion.value = true
  deletionBlockedReason.value = null
  teacherClasses.value = []

  const result = await checkTeacherDeletion(teacher)
  teacherClasses.value = result.classes
  if (!result.canDelete) {
    deletionBlockedReason.value = 'classes'
  }
  isCheckingDeletion.value = false
}

// Save teacher (create or update)
const saveTeacher = async () => {
  if (isEditing.value && form.value.id) {
    await updateTeacher(form.value.id, form.value)
  }
  else {
    await createTeacher(form.value)
  }
  isDialogOpen.value = false
}

// Handle delete teacher
const handleDeleteTeacher = async () => {
  if (!selectedTeacher.value || deletionBlockedReason.value) return
  await deleteTeacher(selectedTeacher.value)
  isDeleteDialogOpen.value = false
  selectedTeacher.value = null
  deletionBlockedReason.value = null
  teacherClasses.value = []
}

// Handle create accounts for deans
const handleCreateAccounts = async () => {
  const toCreate = deansWithoutAccounts(selectedTeachers.value)
  if (toCreate.length === 0) return

  isCreatingAccounts.value = true
  createdCredentials.value = await createDeanAccounts(toCreate)
  selectedTeachers.value = []
  isCreatingAccounts.value = false
  isAccountDialogOpen.value = true
}

// Confirm password reset
const confirmResetPassword = (teacher: Teacher) => {
  if (!teacher.user_id) return
  teacherToReset.value = teacher
  isResetConfirmDialogOpen.value = true
}

// Handle password reset
const handleResetPassword = async () => {
  if (!teacherToReset.value) return

  isResettingPassword.value = true
  isResetConfirmDialogOpen.value = false
  resetPasswordCredential.value = await resetPassword(teacherToReset.value)
  isResettingPassword.value = false
  teacherToReset.value = null
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
  link.download = `teacher_accounts_${new Date().toISOString().split('T')[0]}.csv`
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

// Computed for active deans without accounts
const activeDeansWithoutAccounts = computed(() => deansWithoutAccounts(selectedTeachers.value))

// Fetch data on mount
onMounted(() => {
  fetchTeachers()
  fetchDepartments()
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
          v-if="activeDeansWithoutAccounts.length > 0"
          color="success"
          variant="outlined"
          prepend-icon="ri-user-add-line"
          class="me-4"
          :loading="isCreatingAccounts"
          @click="handleCreateAccounts"
        >
          Create Accounts ({{ activeDeansWithoutAccounts.length }})
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
        :sort-by="[{ key: 'position', order: 'asc' }, { key: 'name', order: 'asc' }]"
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
          <span v-if="getDepartmentNames(item).length > 0">
            {{ getDepartmentNames(item).join(', ') }}
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
            <p class="text-body-1 text-medium-emphasis">No teachers found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog v-model="isDialogOpen" max-width="700" persistent>
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Teacher' : 'Add New Teacher' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="4">
              <VTextField v-model="form.first_name" label="First Name" variant="outlined" :rules="[v => !!v || 'First name is required']"/>
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="form.middle_name" label="Middle Name" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="form.last_name" label="Last Name" variant="outlined" :rules="[v => !!v || 'Last name is required']"/>
            </VCol>
            <VCol cols="12" md="9">
              <VTextField v-model="form.email" label="Email" type="email" variant="outlined"
              :rules="[requiredValidator, emailValidator]" />
            </VCol>
            <VCol cols="12" md="3">
              <VSelect v-model="form.gender" label="Gender" :items="GENDER_OPTIONS" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect v-model="form.position" label="Position" :items="POSITION_OPTIONS" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect v-model="form.is_active" label="Status" :items="STATUS_OPTIONS" variant="outlined" />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect
                v-model="form.department_id"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                clearable
              />
            </VCol>
            <VCol v-if="existingDeanInDepartment" cols="12">
              <VAlert type="error" variant="tonal" density="compact">
                <template #title>Cannot assign Dean position</template>
                The {{ getDepartmentName(form.department_id!) }} department already has a Dean:
                <strong>{{ existingDeanInDepartment.last_name }}, {{ existingDeanInDepartment.first_name }}</strong>.
              </VAlert>
            </VCol>
            
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDialogOpen = false">Cancel</VBtn>
          <VBtn
            color="primary"
            :disabled="!form.first_name || !form.last_name || !form.position || !!existingDeanInDepartment"
            @click="saveTeacher"
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
          Delete Teacher
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <div v-if="isCheckingDeletion" class="d-flex justify-center pa-4">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <template v-if="deletionBlockedReason === 'classes'">
              <VAlert type="error" variant="tonal" class="mb-4">
                <template #title>Cannot Delete Teacher</template>
                This teacher is assigned to {{ teacherClasses.length }} class(es). Please reassign them first.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Assigned Classes:</p>
              <VList density="compact" class="mb-4">
                <VListItem v-for="cls in teacherClasses" :key="cls.id" density="compact">
                  <template #prepend>
                    <VIcon icon="ri-book-line" size="small" />
                  </template>
                  <VListItemTitle>
                    {{ (cls.course_id as any)?.courseCode || 'Unknown Course' }} - Section {{ cls.section }}
                  </VListItemTitle>
                  <VListItemSubtitle>
                    {{ (cls.acadTerm_id as any)?.schoolYear }} {{ (cls.acadTerm_id as any)?.semester }}
                  </VListItemSubtitle>
                </VListItem>
              </VList>
            </template>

            <template v-else>
              <p class="mb-4">
                Are you sure you want to delete <strong>{{ selectedTeacher ? getFullName(selectedTeacher) : '' }}</strong>?
              </p>

              <VAlert v-if="selectedTeacher?.user_id" type="warning" variant="tonal" class="mb-3">
                <template #title>User Account Will Be Deleted</template>
                This teacher has an associated user account that will be permanently deleted.
              </VAlert>

              <p class="text-error font-weight-medium mb-0">This action cannot be undone.</p>
            </template>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeleteDialogOpen = false">
            {{ deletionBlockedReason ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="!deletionBlockedReason && !isCheckingDeletion"
            color="error"
            @click="handleDeleteTeacher"
          >
            Delete Teacher
          </VBtn>
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
          <p class="font-weight-bold text-primary">{{ teacherToReset ? getFullName(teacherToReset) : '' }}</p>
          <p class="text-medium-emphasis mt-2">{{ teacherToReset?.email }}</p>
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
