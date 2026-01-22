<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'school-offices',
    allowedRoles: ['administrator'],
  },
})

interface SchoolOffice {
  id?: number
  name: string
  description: string
  is_active: boolean
}

// State
const offices = ref<SchoolOffice[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const isSaving = ref(false)
const selectedOffice = ref<SchoolOffice | null>(null)
const search = ref('')

// Deletion prevention state
const isCheckingDeletion = ref(false)
const deletionBlockedReason = ref<string | null>(null)
const relatedSurveys = ref<any[]>([])

const form = ref<SchoolOffice>({
  name: '',
  description: '',
  is_active: true,
})

// Table headers
const headers = [
  { title: 'Office Name', key: 'name', sortable: true },
  { title: 'Status', key: 'is_active', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

const snackbar = ref({
  show: false,
  message: '',
  color: 'success', 
})

const showMessage = (message: string, color: string = 'success') => {
  snackbar.value = {
    show: true,
    message,
    color,
  }
}

// Fetch offices from Directus
const fetchOffices = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/SchoolOffices', {
      params: {
        sort: ['name'],
      },
    })
    offices.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch school offices:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Open dialog for creating new office
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    name: '',
    description: '',
    is_active: true,
  }
  isDialogOpen.value = true
}

// Open dialog for editing office
const openEditDialog = (office: SchoolOffice) => {
  isEditing.value = true
  form.value = {
    id: office.id,
    name: office.name,
    description: office.description || '',
    is_active: office.is_active ?? true,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = async (office: SchoolOffice) => {
  selectedOffice.value = office
  isDeleteDialogOpen.value = true
  await checkOfficeDeletion(office)
}

// Check if school office can be deleted
const checkOfficeDeletion = async (office: SchoolOffice) => {
  if (!office.id) return

  isCheckingDeletion.value = true
  deletionBlockedReason.value = null
  relatedSurveys.value = []

  try {
    // Check for surveys using this office
    const surveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { office_id: { _eq: office.id } },
        fields: ['id', 'title', 'survey_type', 'is_active', 'academic_term_id.schoolYear', 'academic_term_id.semester'],
        limit: 10,
      },
    })

    if (surveysRes.data && surveysRes.data.length > 0) {
      relatedSurveys.value = surveysRes.data
      deletionBlockedReason.value = 'surveys'
    }
  }
  catch (error) {
    console.error('Failed to check office deletion:', error)
  }
  finally {
    isCheckingDeletion.value = false
  }
}

// Save office (create or update)
const saveOffice = async () => {
  if (!form.value.name.trim()) return

  isSaving.value = true
  try {
    const body = {
      name: form.value.name,
      description: form.value.description,
      is_active: form.value.is_active,
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/SchoolOffices/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
      showMessage('School office updated successfully')
    }
    else {
      await $api('/items/SchoolOffices', {
        method: 'POST',
        body,
      })
      showMessage('School office created successfully')
    }

    isDialogOpen.value = false
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to save school office:', error)
    showMessage('Failed to save school office.', 'error')
  }
  finally {
    isSaving.value = false
  }
}

// Delete office
const deleteOffice = async () => {
  if (!selectedOffice.value?.id) return

  // Don't allow deletion if office has dependencies
  if (deletionBlockedReason.value) {
    return
  }

  try {
    await $api(`/items/SchoolOffices/${selectedOffice.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedOffice.value = null
    deletionBlockedReason.value = null
    relatedSurveys.value = []
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to delete school office:', error)
  }
}

// Toggle office status
const toggleStatus = async (office: SchoolOffice) => {
  try {
    await $api(`/items/SchoolOffices/${office.id}`, {
      method: 'PATCH',
      body: { is_active: !office.is_active },
    })
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to update office status:', error)
  }
}

// Fetch data on mount
onMounted(() => {
  fetchOffices()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">School Offices</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search offices..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Office
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="offices"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>

        <template #item.is_active="{ item }">
          <VChip
            :color="item.is_active ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="cursor-pointer"
            @click="toggleStatus(item)"
          >
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </VChip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click.stop="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click.stop="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-8">
            <VIcon icon="ri-building-2-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No School Offices</p>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Add offices like Registrar, Cashier, Library, etc. for students to evaluate.
            </p>
            <VBtn
              color="primary"
              prepend-icon="ri-add-line"
              @click="openCreateDialog"
            >
              Add Office
            </VBtn>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="400"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit School Office' : 'Add New School Office' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="form.name"
                label="Office Name"
                placeholder="e.g., Registrar, Clinic, Library"
                variant="outlined"
                density="comfortable"
                :rules="[v => !!v || 'Office name is required']"
              />
            </VCol>

            <VCol cols="12" class="pt-0">
              <div class="pa-4 border rounded d-flex align-center justify-space-between bg-grey-lighten-5">
                <div>
                  <div class="text-subtitle-1">Office Status</div>
                  <div class="text-caption text-medium-emphasis">
                    Enable or disable this office
                  </div>
                </div>
                
                <VSwitch
                  v-model="form.is_active"
                  :label="form.is_active ? 'Active' : 'Inactive'"
                  color="success"
                  hide-details
                  inset
                  density="compact"
                  class="ms-4"
                />
              </div>
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
            :disabled="!form.name.trim()"
            :loading="isSaving"
            @click="saveOffice"
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
          Delete School Office
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Loading state -->
          <div v-if="isCheckingDeletion" class="d-flex justify-center pa-4">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <!-- Blocked: Has surveys -->
            <template v-if="deletionBlockedReason === 'surveys'">
              <VAlert
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <template #title>
                  Cannot Delete School Office
                </template>
                This office has {{ relatedSurveys.length }}+ survey(s) associated with it. Please delete the surveys first.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Surveys for this office (showing first 10):</p>
              <VList density="compact" class="mb-4">
                <VListItem
                  v-for="survey in relatedSurveys"
                  :key="survey.id"
                  density="compact"
                >
                  <template #prepend>
                    <VIcon icon="ri-survey-line" size="small" />
                  </template>
                  <VListItemTitle>
                    {{ survey.title }}
                  </VListItemTitle>
                  <VListItemSubtitle>
                    {{ survey.academic_term_id?.schoolYear }} {{ survey.academic_term_id?.semester }}
                    <VChip
                      :color="survey.is_active === 'Active' ? 'success' : 'secondary'"
                      size="x-small"
                      class="ms-2"
                    >
                      {{ survey.is_active }}
                    </VChip>
                  </VListItemSubtitle>
                </VListItem>
              </VList>
            </template>

            <!-- Can delete -->
            <template v-else>
              <p class="mb-4">
                Are you sure you want to delete <strong>{{ selectedOffice?.name }}</strong>?
              </p>
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
            @click="deleteOffice"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top end"
    >
      {{ snackbar.message }}

      <template #actions>
        <VBtn
          icon="ri-close-line"
          variant="text"
          density="comfortable"
          @click="snackbar.show = false"
        />
      </template>
    </VSnackbar>    
  </div>
</template>
