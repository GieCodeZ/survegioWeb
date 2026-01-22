<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'departments',
    allowedRoles: ['administrator'],
  },
})

interface Teacher {
  id: number
  first_name: string
  middle_name: string
  last_name: string
  position: string
  email: string
}

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
  teacher_id: any[]
  classes_id?: any[]
}

const route = useRoute()

const departmentId = computed(() => Number((route.params as { id: string }).id))

// State
const departmentData = ref<Department | null>(null)
const teachers = ref<Teacher[]>([])
const isLoading = ref(true)
const search = ref('')

// Table headers for teachers
const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Position', key: 'position', sortable: true },
  { title: 'Email', key: 'email', sortable: true },
]

// Get teacher full name
const getFullName = (teacher: Teacher) => {
  const middle = teacher.middle_name ? ` ${teacher.middle_name}.` : ''
  return `${teacher.last_name}, ${teacher.first_name}${middle}`
}

// Get department name
const getDepartmentName = (): string => {
  if (!departmentData.value)
    return '-'
  if (typeof departmentData.value.name === 'object' && departmentData.value.name !== null)
    return departmentData.value.name.programName
  return '-'
}

// Get department code
const getDepartmentCode = (): string => {
  if (!departmentData.value)
    return '-'
  if (typeof departmentData.value.name === 'object' && departmentData.value.name !== null)
    return departmentData.value.name.programCode
  return '-'
}

// Get classes count
const getClassesCount = (): number => {
  if (!departmentData.value || !departmentData.value.classes_id || !Array.isArray(departmentData.value.classes_id))
    return 0
  return departmentData.value.classes_id.length
}

// Filtered teachers based on search
const filteredTeachers = computed(() => {
  if (!search.value.trim()) return teachers.value

  const searchTerm = search.value.toLowerCase().trim()
  return teachers.value.filter(teacher => {
    const fullName = getFullName(teacher).toLowerCase()
    const position = (teacher.position || '').toLowerCase()
    const email = (teacher.email || '').toLowerCase()

    return fullName.includes(searchTerm)
      || position.includes(searchTerm)
      || email.includes(searchTerm)
  })
})

// Fetch department details
const fetchDepartmentDetails = async () => {
  isLoading.value = true
  try {
    const res = await $api(`/items/Department/${departmentId.value}`, {
      params: {
        fields: [
          '*',
          'name.*',
          'teacher_id.Teachers_id.*',
          'classes_id.*',
        ],
      },
    })

    departmentData.value = res.data

    // Extract teachers from junction table
    if (res.data?.teacher_id && Array.isArray(res.data.teacher_id)) {
      teachers.value = res.data.teacher_id
        .map((item: any) => {
          if (typeof item === 'object' && item !== null) {
            // Junction table structure
            if (item.Teachers_id) {
              return typeof item.Teachers_id === 'object' ? item.Teachers_id : null
            }
            // Direct teacher object
            if (item.first_name) {
              return item
            }
          }
          return null
        })
        .filter((t: any) => t !== null && t !== undefined)
    }
  }
  catch (error) {
    console.error('Failed to fetch department details:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Export teachers to CSV
const exportToCSV = () => {
  if (!departmentData.value || teachers.value.length === 0)
    return

  const deptName = getDepartmentName()
  const deptCode = getDepartmentCode()

  // Build CSV content
  const lines: string[] = []

  // Header info
  lines.push(`Department: ${deptName} (${deptCode})`)
  lines.push(`Total Teachers: ${teachers.value.length}`)
  lines.push('')

  // Table header
  lines.push('No.,Name,Position,Email')

  // Teacher data
  teachers.value.forEach((teacher: Teacher, index: number) => {
    const name = getFullName(teacher)
    const position = teacher.position || ''
    const email = teacher.email || ''
    lines.push(`${index + 1},"${name}","${position}","${email}"`)
  })

  // Create CSV content
  const csvContent = lines.join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `Department_${deptCode}_Teachers.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Fetch data on mount
onMounted(() => {
  fetchDepartmentDetails()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <div>
        <h4 class="text-h4">
          Department Details
        </h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          View department information and assigned teachers
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular
          indeterminate
          color="primary"
        />
        <span class="ms-4">Loading department details...</span>
      </VCardText>
    </VCard>

    <!-- Department Details -->
    <template v-else-if="departmentData">
      <!-- Department Info Card -->
      <VCard class="mb-6">
        <VCardText class="pa-6">
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Department Name
              </div>
              <div class="text-h5 font-weight-medium">
                {{ getDepartmentName() }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ getDepartmentCode() }}
              </div>
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Total Teachers
              </div>
              <div class="text-h4 font-weight-medium text-primary">
                {{ teachers.length }}
              </div>
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Total Classes
              </div>
              <div class="text-h4 font-weight-medium text-info">
                {{ getClassesCount() }}
              </div>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Teachers List Card -->
      <VCard>
        <VCardTitle class="d-flex align-center pa-6">
          <span class="text-h5">Faculty Members</span>
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
          <VBtn
            color="secondary"
            variant="outlined"
            prepend-icon="ri-download-2-line"
            :disabled="teachers.length === 0"
            @click="exportToCSV"
          >
            Export CSV
          </VBtn>
        </VCardTitle>

        <VDivider />

        <VDataTable
          :headers="headers"
          :items="filteredTeachers"
          hover
          item-value="id"
        >
          <template #item.id="{ item }">
            <span class="text-medium-emphasis">{{ item.id }}</span>
          </template>

          <template #item.name="{ item }">
            <div class="d-flex align-center gap-2">
              <VAvatar
                size="32"
                :color="item.position?.toLowerCase() === 'dean' ? 'warning' : 'primary'"
                variant="tonal"
              >
                <span class="text-body-2">{{ item.first_name?.[0] }}{{ item.last_name?.[0] }}</span>
              </VAvatar>
              <div>
                <span class="font-weight-medium">{{ getFullName(item) }}</span>
                <VChip
                  v-if="item.position?.toLowerCase() === 'dean'"
                  size="x-small"
                  color="warning"
                  class="ms-2"
                >
                  Dean
                </VChip>
              </div>
            </div>
          </template>

          <template #item.position="{ item }">
            <span v-if="item.position">{{ item.position }}</span>
            <span v-else class="text-medium-emphasis">-</span>
          </template>

          <template #item.email="{ item }">
            <span v-if="item.email" class="text-body-2">{{ item.email }}</span>
            <span v-else class="text-medium-emphasis">-</span>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <VIcon
                icon="ri-user-line"
                size="48"
                class="text-medium-emphasis mb-4"
              />
              <p class="text-body-1 text-medium-emphasis mb-0">
                No teachers assigned to this department
              </p>
            </div>
          </template>
        </VDataTable>
      </VCard>
    </template>

    <!-- Error State -->
    <VCard v-else>
      <VCardText class="text-center pa-12">
        <VIcon
          icon="ri-error-warning-line"
          size="48"
          class="text-error mb-4"
        />
        <p class="text-body-1 mb-4">
          Failed to load department details
        </p>
        <VBtn
          color="primary"
          @click="fetchDepartmentDetails"
        >
          Try Again
        </VBtn>
      </VCardText>
    </VCard>
  </div>
</template>
