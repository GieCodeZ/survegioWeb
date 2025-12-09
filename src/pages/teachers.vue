<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'teachers',
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
const resetPasswordCredential = ref<AccountCredential | null>(null)
const isResettingPassword = ref(false)

const form = ref({
  id: undefined as number | undefined,
  first_name: '',
  middle_name: '',
  last_name: '',
  position: '',
  gender: '',
  email: '',
  Department: null as number[] | null,
  is_active: 'Active' as string,
  user_id: null as string | null,
})

const search = ref('')
const departmentFilter = ref<number | null>(null)
const statusFilter = ref<string | null>(null)

// Options
const positionOptions = ['Dean', 'Professor']
const genderOptions = ['Male', 'Female']
const statusOptions = ['Active', 'Draft', 'Archived']

// Department options for filter dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '-',
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
    const tId = typeof t === 'object' ? (t.id || t.Teachers_id) : t
    return tId === teacher.id
  })
}

// Filtered teachers by department and status
const filteredTeachers = computed(() => {
  let result = teachers.value

  if (departmentFilter.value)
    result = result.filter(teacher => isTeacherInDepartment(teacher, departmentFilter.value!))

  if (statusFilter.value)
    result = result.filter(teacher => teacher.is_active === statusFilter.value)

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
  const middle = teacher.middle_name ? ` ${teacher.middle_name}.` : ''

  return `${teacher.first_name}${middle} ${teacher.last_name}`
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
      const tId = typeof t === 'object' ? (t.id || t.Teachers_id) : t
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

    teachers.value = res.data || []
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
        fields: ['id', 'name.id', 'name.programName', 'name.programCode', 'teacher_id.id'],
      },
    })

    departments.value = res.data || []
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

    roles.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch roles:', error)
  }
}

// Get role ID by name
const getRoleId = (roleName: string): string | null => {
  const role = roles.value.find(r => r.name.toLowerCase() === roleName.toLowerCase())
  return role?.id || null
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
    gender: '',
    email: '',
    Department: null,
    is_active: 'Active',
    user_id: null,
  }
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
    is_active: teacher.is_active || 'Active',
    user_id: teacher.user_id || null,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (teacher: Teacher) => {
  selectedTeacher.value = teacher
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

    if (isEditing.value && form.value.id) {
      // Update existing teacher
      await $api(`/items/Teachers/${form.value.id}`, {
        method: 'PATCH',
        body,
      })

      // Update user account status if teacher has an account
      if (form.value.user_id)
        await updateUserStatus(form.value.user_id, form.value.is_active)
    }
    else {
      // Create new teacher
      await $api('/items/Teachers', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchTeachers()
  }
  catch (error) {
    console.error('Failed to save teacher:', error)
  }
}

// Delete teacher
const deleteTeacher = async () => {
  if (!selectedTeacher.value?.id)
    return

  try {
    await $api(`/items/Teachers/${selectedTeacher.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedTeacher.value = null
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

// Reset password for a teacher (dean)
const resetPassword = async (teacher: Teacher) => {
  if (!teacher.user_id)
    return

  isResettingPassword.value = true

  try {
    const password = generatePassword()

    await $api(`/users/${teacher.user_id}`, {
      method: 'PATCH',
      body: { password },
    })

    resetPasswordCredential.value = {
      name: getFullName(teacher),
      email: teacher.email,
      password,
    }
    isResetPasswordDialogOpen.value = true
  }
  catch (error) {
    console.error('Failed to reset password:', error)
  }
  finally {
    isResettingPassword.value = false
  }
}

// Copy single credential to clipboard
const copySingleCredential = () => {
  if (!resetPasswordCredential.value)
    return
  const c = resetPasswordCredential.value
  const text = `${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`
  navigator.clipboard.writeText(text)
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
        <span class="text-h5">Teachers</span>
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
          :items="statusOptions"
          label="Status"
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
              :color="item.gender === 'Male' ? 'primary' : 'pink'"
              variant="tonal"
            >
              <span class="text-body-1 font-weight-medium">
                {{ item.first_name.charAt(0) }}{{ item.last_name.charAt(0) }}
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
              @click="resetPassword(item)"
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
                :items="positionOptions"
                variant="outlined"
                :rules="[v => !!v || 'Position is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.gender"
                label="Gender"
                :items="genderOptions"
                variant="outlined"
                :rules="[v => !!v || 'Gender is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.is_active"
                label="Status"
                :items="statusOptions"
                variant="outlined"
                :rules="[v => !!v || 'Status is required']"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="form.email"
                label="Email"
                placeholder="Enter email address"
                type="email"
                variant="outlined"
                :rules="[v => !!v || 'Email is required', v => /.+@.+\..+/.test(v) || 'Email must be valid']"
              />
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
            :disabled="!form.first_name || !form.last_name || !form.position || !form.gender || !form.email"
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
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Teacher
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedTeacher ? getFullName(selectedTeacher) : '' }}</strong>?
          This action cannot be undone.
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
            @click="deleteTeacher"
          >
            Delete
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

    <!-- Reset Password Dialog -->
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
