/*
Version: v1
Date: 2025-12-23
Design, Author, Updated by: Girish Subramanya <girish.subramanya@daimlertruck.com>, VCP, B&I, DTICI
*/
document.addEventListener('DOMContentLoaded', () => {
    console.log("Script loaded - v3");
    const draggables = document.querySelectorAll('.draggable-item');
    const dropZones = document.querySelectorAll('.drop-zone');
    const propertiesForm = document.getElementById('properties-form');
    const generateBtn = document.getElementById('generate-btn');
    const saveTemplateBtn = document.getElementById('save-template-btn');
    const saveWorkBtn = document.getElementById('save-work-btn');
    const downloadBtn = document.getElementById('download-btn');
    const yamlOutput = document.getElementById('yaml-output');
    const workflowNameInput = document.getElementById('workflow-name');

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Predefined
    const predefinedList = document.getElementById('predefined-list');
    const predefinedPreview = document.getElementById('predefined-yaml-preview');
    const loadPredefinedBtn = document.getElementById('load-predefined-btn');
    let selectedPredefined = null;

    // Import
    const importArea = document.getElementById('import-yaml-area');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');
    const importOpenFileBtn = document.getElementById('import-open-file-btn');


    let draggedItem = null;
    let selectedElement = null;

    // State to hold workflow data
    let workflowData = {
        name: 'CI/CD Pipeline',
        on: {}, // Object for triggers: { 'push': { branches: [] }, ... }
        env: {},
        jobs: [] // List of job objects
    };

    // --- Tabs Logic ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // --- Predefined Actions Logic ---
    if (window.workflowsConfig) {
        window.workflowsConfig.forEach((wf, index) => {
            const el = document.createElement('div');
            el.className = 'draggable-item'; // Reusing style
            el.style.cursor = 'pointer';
            el.innerHTML = `<strong>${wf.label}</strong><br><small>${wf.description || ''}</small>`;
            el.onclick = () => {
                // Highlight
                document.querySelectorAll('#predefined-list .draggable-item').forEach(i => i.style.borderColor = '#d0d7de');
                el.style.borderColor = '#0969da';

                selectedPredefined = wf.data;

                // Show YAML preview (convert JSON to YAML via backend or simple JSON dump for now)
                // For accurate preview we should use the backend generate, but for speed let's just JSON stringify
                // or we can just send it to /generate to get the YAML.

                loadPredefinedBtn.disabled = false;

                fetch('/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selectedPredefined)
                })
                .then(r => r.json())
                .then(d => {
                    predefinedPreview.value = d.yaml;
                });
            };
            predefinedList.appendChild(el);
        });
    }

    loadPredefinedBtn.addEventListener('click', () => {
        if (selectedPredefined) {
            importWorkflow(selectedPredefined);
            // Switch to editor
            document.querySelector('.tab-btn[data-tab="tab-editor"]').click();
        }
    });

    // --- Import Logic ---

    // File Inputs Handlers
    function handleFileSelect(event, callback) {
        console.log("File selected");
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log("File read successfully");
            callback(e.target.result);
        };
        reader.readAsText(file);
        // Reset input so same file can be selected again
        event.target.value = '';
    }

    if (importOpenFileBtn && importFileInput) {
        importOpenFileBtn.addEventListener('click', () => {
             console.log("Import button clicked");
             importFileInput.click();
        });
        importFileInput.addEventListener('change', (e) => {
            console.log("Import input change");
            handleFileSelect(e, (content) => {
                importArea.value = content;
                console.log("Import area updated");
            });
        });
    }


    function parseAndImport(yamlContent) {
        if (!yamlContent.trim()) return;

        fetch('/parse_yaml', {
            method: 'POST',
            body: yamlContent
        })
        .then(r => {
            if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Parse error'); });
            return r.json();
        })
        .then(data => {
            importWorkflow(data);
            document.querySelector('.tab-btn[data-tab="tab-editor"]').click();
        })
        .catch(err => alert('Error importing YAML: ' + err.message));
    }

    importBtn.addEventListener('click', () => {
        const yamlContent = importArea.value;
        parseAndImport(yamlContent);
    });

    function importWorkflow(data) {
        // Clear YAML output when loading new workflow
        if (yamlOutput) yamlOutput.value = '';

        // Reset workflowData
        workflowData = {
            name: data.name || 'Imported Workflow',
            on: {},
            env: data.env || {},
            jobs: []
        };

        // Update Name Input
        workflowNameInput.value = workflowData.name;

        // Map 'on'
        if (typeof data.on === 'string') {
            workflowData.on[data.on] = {};
        } else if (typeof data.on === 'object') {
            // It could be array or object. GHA supports both.
            if (Array.isArray(data.on)) {
                data.on.forEach(evt => workflowData.on[evt] = {});
            } else {
                workflowData.on = data.on || {};
            }
        }

        // Map 'jobs'
        // YAML jobs is a dict: job_id -> job_content
        if (data.jobs) {
            Object.keys(data.jobs).forEach(jobId => {
                const jobContent = data.jobs[jobId];
                const newJob = {
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: jobId, // Use key as name/id reference
                    runsOn: jobContent['runs-on'] || 'ubuntu-latest',
                    needs: jobContent.needs ? (Array.isArray(jobContent.needs) ? jobContent.needs.join(', ') : jobContent.needs) : '',
                    if: jobContent.if || '',
                    steps: []
                };

                if (jobContent.steps && Array.isArray(jobContent.steps)) {
                    jobContent.steps.forEach(s => {
                        const stepId = 'step_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        const newStep = {
                            id: stepId,
                            name: s.name || (s.uses ? s.uses : (s.run ? 'Run Command' : 'Step')),
                        };

                        if (s.uses) newStep.uses = s.uses;
                        if (s.run) newStep.run = s.run;
                        if (s.with) newStep.with = s.with;
                        if (s.env) newStep.env = s.env;
                        if (s.shell) newStep.shell = s.shell;
                        if (s._comment) newStep._comment = s._comment;
                        if (s.if) newStep.if = s.if;

                        // Try to infer config subtype
                        if (s.uses) {
                            // check if matches any config
                            if (window.stepsConfig) {
                                const matched = window.stepsConfig.find(sc => {
                                    // fuzzy match uses?
                                    // if config has steps, check if any step uses matches
                                    if (sc.steps) {
                                        return sc.steps.some(st => st.uses === s.uses);
                                    }
                                    return false;
                                });
                                if (matched) {
                                    newStep._configSubtype = matched.subtype;
                                    // find index
                                    newStep._configStepIndex = matched.steps.findIndex(st => st.uses === s.uses);
                                } else {
                                    newStep._configSubtype = 'uses'; // default generic
                                }
                            }
                        } else if (s.run) {
                            newStep._configSubtype = 'run';
                        }

                        newJob.steps.push(newStep);
                    });
                }
                workflowData.jobs.push(newJob);
            });
        }

        // Render everything
        renderTriggers();
        renderJobs();
    }

    // Initialize drag events
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', (e) => {
            draggedItem = draggable;
            e.dataTransfer.setData('type', draggable.dataset.type);
            e.dataTransfer.setData('subtype', draggable.dataset.subtype || '');
            e.dataTransfer.setData('value', draggable.dataset.value || '');
            e.dataTransfer.setData('defaultName', draggable.dataset.defaultName || '');
        });
    });

    // Handle Drop Zones (Triggers and Jobs)
    const triggersZone = document.getElementById('triggers-zone');
    const jobsZone = document.getElementById('jobs-zone');
    const canvas = document.getElementById('workflow-canvas');

    // Canvas click to select workflow properties
    canvas.addEventListener('click', (e) => {
        // If clicking on drop zones or canvas background
        if (e.target === canvas || e.target === triggersZone || e.target === jobsZone || e.target.classList.contains('zone-label')) {
            selectItem(e, 'workflow', null);
        }
    });

    [triggersZone, jobsZone].forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', handleDrop);
    });

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling
        this.classList.remove('drag-over');

        const type = e.dataTransfer.getData('type');

        if (this.id === 'triggers-zone' && type === 'trigger') {
            const value = e.dataTransfer.getData('value');
            addTrigger(value);
        } else if (this.id === 'jobs-zone' && type === 'job') {
            addJob();
        }
    }

    function addTrigger(value) {
        // Prevent duplicates
        if (workflowData.on[value]) return;

        workflowData.on[value] = {}; // Initialize config for trigger
        // Set default type for pull_request
        if (value === 'pull_request') {
             if (window.triggerConfig && window.triggerConfig.pull_request && window.triggerConfig.pull_request.default_type) {
                 workflowData.on[value].types = [window.triggerConfig.pull_request.default_type];
             }
        }
        renderTriggers();
    }

    function removeTrigger(value) {
        delete workflowData.on[value];
        renderTriggers();
        clearPropertiesIfSelected('trigger', value);
    }

    function renderTriggers() {
        triggersZone.innerHTML = '<div class="zone-label">Drop Triggers Here</div>';
        Object.keys(workflowData.on).forEach(trigger => {
            const el = document.createElement('div');
            el.className = 'canvas-item trigger-item';
            el.textContent = trigger;
            el.onclick = (e) => selectItem(e, 'trigger', trigger);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeTrigger(trigger);
            };

            el.appendChild(removeBtn);
            triggersZone.appendChild(el);
        });
    }

    function addJob() {
        const jobId = 'job_' + Date.now();
        // Generate a unique name
        let baseName = 'build';
        let name = baseName;
        let counter = 1;
        while (workflowData.jobs.some(j => j.name === name)) {
            name = `${baseName}-${counter}`;
            counter++;
        }

        const newJob = {
            id: jobId,
            name: name,
            runsOn: 'ubuntu-latest',
            steps: []
        };

        // Auto-add 'needs' if it's not the first job
        if (workflowData.jobs.length > 0) {
            // Default needs to the last job added
            newJob.needs = workflowData.jobs[workflowData.jobs.length - 1].name;
        }

        workflowData.jobs.push(newJob);
        renderJobs();
    }

    function removeJob(jobId) {
        workflowData.jobs = workflowData.jobs.filter(j => j.id !== jobId);
        renderJobs();
        clearPropertiesIfSelected('job', jobId);
    }

    function moveJobUp(jobId) {
        const index = workflowData.jobs.findIndex(j => j.id === jobId);
        if (index > 0) {
            const temp = workflowData.jobs[index];
            workflowData.jobs[index] = workflowData.jobs[index - 1];
            workflowData.jobs[index - 1] = temp;
            renderJobs();
        }
    }

    function moveJobDown(jobId) {
        const index = workflowData.jobs.findIndex(j => j.id === jobId);
        if (index < workflowData.jobs.length - 1) {
            const temp = workflowData.jobs[index];
            workflowData.jobs[index] = workflowData.jobs[index + 1];
            workflowData.jobs[index + 1] = temp;
            renderJobs();
        }
    }

    function renderJobs() {
        jobsZone.innerHTML = '<div class="zone-label">Drop Jobs Here</div>';
        workflowData.jobs.forEach(job => {
            const jobEl = document.createElement('div');
            jobEl.className = 'canvas-item job-item';
            jobEl.id = job.id;
            jobEl.onclick = (e) => selectItem(e, 'job', job);

            const title = document.createElement('div');
            title.innerHTML = `<strong>${job.name}</strong> <small>(${job.runsOn})</small>`;
            jobEl.appendChild(title);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeJob(job.id);
            };
            jobEl.appendChild(removeBtn);

            const upJobBtn = document.createElement('button');
            upJobBtn.className = 'move-btn move-up';
            upJobBtn.innerHTML = '&#8593;';
            upJobBtn.style.right = '35px'; // Adjust position so it doesn't overlap with remove btn
            upJobBtn.onclick = (e) => {
                e.stopPropagation();
                moveJobUp(job.id);
            };
            jobEl.appendChild(upJobBtn);

            const downJobBtn = document.createElement('button');
            downJobBtn.className = 'move-btn move-down';
            downJobBtn.innerHTML = '&#8595;';
            downJobBtn.style.right = '60px'; // Adjust position
            downJobBtn.onclick = (e) => {
                e.stopPropagation();
                moveJobDown(job.id);
            };
            jobEl.appendChild(downJobBtn);

            // Steps Container
            const stepsContainer = document.createElement('div');
            stepsContainer.className = 'steps-container';
            stepsContainer.dataset.jobId = job.id;
            stepsContainer.innerHTML = '<div class="zone-label" style="font-size:10px; margin-bottom:5px;">Steps</div>';

            // Allow dropping steps here
            stepsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                stepsContainer.style.borderColor = '#0969da';
            });
            stepsContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                stepsContainer.style.borderColor = '#d0d7de';
            });
            stepsContainer.addEventListener('drop', (e) => handleStepDrop(e, job.id));

            job.steps.forEach(step => {
                const stepEl = document.createElement('div');
                stepEl.className = 'canvas-item step-item';
                stepEl.textContent = step.name || (step.uses ? step.uses : step.run);
                stepEl.onclick = (e) => {
                    e.stopPropagation();
                    selectItem(e, 'step', step, job.id);
                };

                const rmStepBtn = document.createElement('button');
                rmStepBtn.className = 'remove-btn';
                rmStepBtn.innerHTML = '&times;';
                rmStepBtn.onclick = (e) => {
                    e.stopPropagation();
                    removeStep(job.id, step.id);
                };
                stepEl.appendChild(rmStepBtn);

                const upStepBtn = document.createElement('button');
                upStepBtn.className = 'move-btn move-up';
                upStepBtn.innerHTML = '&#8593;';
                upStepBtn.onclick = (e) => {
                    e.stopPropagation();
                    moveStepUp(job.id, step.id);
                };
                stepEl.appendChild(upStepBtn);

                const downStepBtn = document.createElement('button');
                downStepBtn.className = 'move-btn move-down';
                downStepBtn.innerHTML = '&#8595;';
                downStepBtn.onclick = (e) => {
                    e.stopPropagation();
                    moveStepDown(job.id, step.id);
                };
                stepEl.appendChild(downStepBtn);

                stepsContainer.appendChild(stepEl);
            });

            jobEl.appendChild(stepsContainer);
            jobsZone.appendChild(jobEl);
        });
    }

    function handleStepDrop(e, jobId) {
        e.preventDefault();
        e.stopPropagation();
        e.target.style.borderColor = '#d0d7de';

        const type = e.dataTransfer.getData('type');
        const subtype = e.dataTransfer.getData('subtype');

        if (type !== 'step') return;

        const job = workflowData.jobs.find(j => j.id === jobId);
        if (!job) return;

        // Find the step config
        let stepConfig = null;
        if (window.stepsConfig) {
            stepConfig = window.stepsConfig.find(s => s.subtype === subtype);
        }

        if (stepConfig && stepConfig.steps) {
            // Add all steps defined in the config
            stepConfig.steps.forEach((s, index) => {
                const stepId = 'step_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                // Deep copy to avoid reference issues
                let newStep = JSON.parse(JSON.stringify(s));
                newStep.id = stepId;
                newStep._configSubtype = subtype;
                newStep._configStepIndex = index;

                // If the 'with' is in the old format (key: value string), convert it to object with value property
                // But we are now defining it in steps_config.json as { value: ..., description: ... } or just string for backward compatibility
                // We should normalize it here if needed, but the current structure allows objects.
                // If it is simple key-value where value is string, it might not have description.
                if (newStep.with) {
                    Object.keys(newStep.with).forEach(key => {
                        let val = newStep.with[key];
                        if (typeof val !== 'object') {
                            newStep.with[key] = { value: val, description: '' };
                        }
                    });
                }

                job.steps.push(newStep);
            });
        } else {
            // Fallback for missing config
            const stepId = 'step_' + Date.now();
            let newStep = { id: stepId, name: 'New Step' };

            if (subtype === 'run') {
                newStep.name = 'Run script';
                newStep.run = 'echo "Hello World"';
            } else if (subtype === 'uses') {
                newStep.name = 'Use Action';
                newStep.uses = 'actions/checkout@v3';
            }
            job.steps.push(newStep);
        }

        renderJobs();
    }

    function removeStep(jobId, stepId) {
        const job = workflowData.jobs.find(j => j.id === jobId);
        if (job) {
            job.steps = job.steps.filter(s => s.id !== stepId);
            renderJobs();
            clearPropertiesIfSelected('step', stepId);
        }
    }

    function moveStepUp(jobId, stepId) {
        const job = workflowData.jobs.find(j => j.id === jobId);
        if (job) {
            const index = job.steps.findIndex(s => s.id === stepId);
            if (index > 0) {
                const temp = job.steps[index];
                job.steps[index] = job.steps[index - 1];
                job.steps[index - 1] = temp;
                renderJobs();
            }
        }
    }

    function moveStepDown(jobId, stepId) {
        const job = workflowData.jobs.find(j => j.id === jobId);
        if (job) {
            const index = job.steps.findIndex(s => s.id === stepId);
            if (index < job.steps.length - 1) {
                const temp = job.steps[index];
                job.steps[index] = job.steps[index + 1];
                job.steps[index + 1] = temp;
                renderJobs();
            }
        }
    }

    function selectItem(e, type, item, parentId = null) {
        if (e) e.stopPropagation();

        // Remove 'selected' class from all items
        document.querySelectorAll('.canvas-item').forEach(el => el.classList.remove('selected'));
        if (e && e.currentTarget) e.currentTarget.classList.add('selected');

        selectedElement = { type, item, parentId };
        renderProperties(type, item);
    }

    function clearPropertiesIfSelected(type, id) {
        if (selectedElement && selectedElement.type === type && (selectedElement.item.id === id || selectedElement.item === id)) {
            selectedElement = null;
            propertiesForm.innerHTML = '<p class="placeholder-text">Select an element to edit its properties.</p>';
        }
    }

    function renderProperties(type, item) {
        let html = '';

        if (type === 'workflow') {
             html = `
                <div class="form-group">
                    <label>Workflow Properties</label>
                    <p style="font-size:12px; color:#666;">Select canvas background to edit global settings.</p>
                </div>

                <div class="form-group">
                    <label>Variables (env)</label>
                    <div id="env-list"></div>
                    <button id="add-env-btn" class="add-btn" style="margin-top:5px; width:100%;">+ Add Variable</button>
                </div>
            `;
            // Note: Workflow Name input is still in header, we can leave it there.
        } else if (type === 'trigger') {
            html = `
                <div class="form-group">
                    <label>Trigger Type</label>
                    <input type="text" value="${item}" disabled>
                </div>
            `;

            if (item === 'push' || item === 'pull_request' || item === 'workflow_dispatch' || item === 'schedule') {
                const config = workflowData.on[item];

                if (item !== 'schedule') {
                    const branches = config && config.branches ? config.branches.join(', ') : '';
                    html += `
                        <div class="form-group">
                            <label>Branches (comma separated)</label>
                            <input type="text" id="prop-trigger-branches" value="${branches}" placeholder="main, feature/*">
                            <small style="color:#666; font-size:10px;">Leave empty for all branches</small>
                        </div>
                    `;
                }

                if (item === 'schedule') {
                    const cron = config && config.cron ? config.cron : '';
                    html += `
                        <div class="form-group">
                            <label>Cron Schedule</label>
                            <input type="text" id="prop-trigger-cron" value="${cron}" placeholder="30 5 * * 1,3">
                            <small style="color:#666; font-size:10px;">
                                POSIX cron syntax: minute hour day month day-of-week<br>
                                e.g., '30 5 * * 1,3' = at 5:30 on Mon and Wed, time in UTC
                            </small>
                        </div>
                    `;
                }

                if (item === 'pull_request') {
                    // Types selection
                    const selectedTypes = workflowData.on[item].types || [];
                    const displayText = selectedTypes.length > 0 ? selectedTypes.join(', ') : 'Select Types...';

                    html += `
                        <div class="form-group">
                            <label>Types</label>
                            <div class="multiselect-dropdown" style="position:relative;">
                                <div id="types-dropdown-btn" style="border:1px solid #ddd; padding:6px 12px; cursor:pointer; background:#fff; border-radius:6px; display:flex; justify-content:space-between; align-items:center; min-height: 32px;">
                                    <span id="types-selected-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:10px; font-size:14px;">${displayText}</span>
                                    <span style="font-size:10px;">&#9660;</span>
                                </div>
                                <div id="types-dropdown-content" style="display:none; border:1px solid #ddd; border-top:none; max-height:200px; overflow-y:auto; padding:5px; position:absolute; width:100%; box-sizing:border-box; background:#fff; z-index:1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 0 0 6px 6px;">`;

                    if (window.triggerConfig && window.triggerConfig.pull_request && window.triggerConfig.pull_request.types) {
                        const types = window.triggerConfig.pull_request.types;
                        types.forEach(t => {
                            const isChecked = selectedTypes.includes(t) ? 'checked' : '';
                            html += `
                                <div style="padding: 4px;">
                                    <label style="font-size:12px; font-weight:normal; display:flex; align-items:center; cursor:pointer;">
                                        <input type="checkbox" class="trigger-type-check" value="${t}" ${isChecked} style="margin-right:8px; width:auto;"> ${t}
                                    </label>
                                </div>
                            `;
                        });
                    }
                    html += `</div></div></div>`;
                }

                if (item === 'workflow_dispatch') {
                    html += `
                        <div class="form-group">
                            <label>Input name</label>
                            <div id="inputs-list"></div>
                            <button id="add-input-btn" class="add-btn" style="margin-top:5px; width:100%;">+ Add variable</button>
                        </div>
                    `;
                }
            }

        } else if (type === 'job') {
            html = `
                <div class="form-group">
                    <label>Job Name</label>
                    <input type="text" id="prop-job-name" value="${item.name}">
                </div>
                <div class="form-group">
                    <label>Needs (comma separated)</label>
                    <input type="text" id="prop-job-needs" value="${item.needs || ''}">
                </div>
                <div class="form-group">
                    <label>Runs On</label>
                    <input type="text" id="prop-job-runs-on" value="${item.runsOn}">
                    <small style="color:#666; font-size:10px;">e.g., ubuntu-latest, windows-latest, self-hosted</small>
                </div>
                <div class="form-group">
                    <label>If Condition</label>
                    <input type="text" id="prop-job-if" value="${item.if || ''}" placeholder="github.event_name == 'push'">
                </div>
            `;
        } else if (type === 'step') {
            html = `
                <div class="form-group">
                    <label>Step Name</label>
                    <input type="text" id="prop-step-name" value="${item.name || ''}">
                </div>
                <div class="form-group">
                    <label>If Condition</label>
                    <input type="text" id="prop-step-if" value="${item.if || ''}" placeholder="always()">
                </div>
            `;

            if (item._comment) {
                html += `
                    <div class="form-group">
                        <label>Comment</label>
                        <input type="text" id="prop-step-comment" value="${item._comment}">
                    </div>
                `;
            }

            if (item.run !== undefined) {
                html += `
                    <div class="form-group">
                        <label>Run Command</label>
                        <textarea id="prop-step-run" rows="5" style="width:100%; resize:vertical; padding:6px; font-family:monospace;">${item.run}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Shell</label>
                        <select id="prop-step-shell">
                            <option value="" ${!item.shell ? 'selected' : ''}>Default</option>
                            <option value="bash" ${item.shell === 'bash' ? 'selected' : ''}>bash</option>
                            <option value="pwsh" ${item.shell === 'pwsh' ? 'selected' : ''}>pwsh</option>
                            <option value="python" ${item.shell === 'python' ? 'selected' : ''}>python</option>
                            <option value="cmd" ${item.shell === 'cmd' ? 'selected' : ''}>cmd</option>
                            <option value="sh" ${item.shell === 'sh' ? 'selected' : ''}>sh</option>
                        </select>
                    </div>
                `;
            } else if (item.uses !== undefined) {
                html += `
                    <div class="form-group">
                        <label>Uses Action</label>
                        <input type="text" id="prop-step-uses" value="${item.uses}">
                    </div>
                `;
            }

            // 'with' parameters
            if (item.with) {
                html += `<div class="form-group"><label>Parameters (with)</label>`;

                // Get config step to find defaults and order
                let configStep = null;
                if (window.stepsConfig && item._configSubtype) {
                    const sc = window.stepsConfig.find(s => s.subtype === item._configSubtype);
                    if (sc && sc.steps && sc.steps[item._configStepIndex] !== undefined) {
                        configStep = sc.steps[item._configStepIndex];
                    }
                }

                // We expect item.with to be an object
                if (typeof item.with === 'object' && item.with !== null) {
                    // Determine keys order: use config order if available, else current keys
                    let keys = Object.keys(item.with);
                    if (configStep && configStep.with) {
                        const configKeys = Object.keys(configStep.with);
                        // Add any keys that are in item.with but not in config (extra keys)
                        const extraKeys = keys.filter(k => !configKeys.includes(k));
                        keys = [...configKeys, ...extraKeys];
                    }

                    keys.forEach(key => {
                        // If key is not in item.with (e.g. was deleted), skip or handle?
                        // It should be there if we initialized from config.
                        if (!Object.prototype.hasOwnProperty.call(item.with, key)) return;

                        let val = item.with[key];
                        let currentVal = '';
                        let description = '';
                        let defaultVal = '';

                        if (typeof val === 'object' && val !== null) {
                            currentVal = val.value || '';
                            description = val.description || '';
                        } else {
                            currentVal = val;
                        }

                        // Get default value and mandatory/selected status from config
                        let mandatory = false;
                        let selected = true;

                        if (configStep && configStep.with && configStep.with[key]) {
                            const configVal = configStep.with[key];
                            if (typeof configVal === 'object') {
                                defaultVal = configVal.value || '';
                                if (configVal.mandatory !== undefined) mandatory = configVal.mandatory;
                                if (configVal.selected !== undefined) selected = configVal.selected;
                            } else {
                                defaultVal = configVal;
                            }
                        }

                        // Check if we have stored selection state in item, else use default
                        // We store selection state in item.with_selected object or similar?
                        // Or we just check if key exists in item.with?
                        // But item.with comes from config initially, so all keys are there.
                        // We need a way to track if it's "selected" or not.
                        // Let's use a hidden property `_selected_params`. If undefined, assume all selected (backward compat).
                        // Initialize `_selected_params` if not present.

                        if (!item._selected_params) {
                            item._selected_params = {};
                            // Populate with defaults
                            keys.forEach(k => {
                                // Default true unless config says false
                                let isSel = true;
                                if (configStep && configStep.with && configStep.with[k] && configStep.with[k].selected === false) {
                                    isSel = false;
                                }
                                if (configStep && configStep.with && configStep.with[k] && configStep.with[k].mandatory === true) {
                                    isSel = true;
                                }
                                item._selected_params[k] = isSel;
                            });
                        }

                        // Use stored state
                        if (item._selected_params[key] !== undefined) {
                            selected = item._selected_params[key];
                        }

                        // Mandatory overrides selection
                        if (mandatory) {
                            selected = true;
                        }

                        // Determine display: if currentVal matches defaultVal, show as placeholder and empty value
                        let displayValue = currentVal;
                        let placeholder = defaultVal;

                        // If current value is same as default, show empty value and use placeholder
                        if (currentVal === defaultVal) {
                            displayValue = '';
                        }

                        const disabledAttr = !selected ? 'disabled' : '';
                        const checkedAttr = selected ? 'checked' : '';
                        const checkboxDisabled = mandatory ? 'disabled' : '';
                        const inputStyle = !selected ? 'background-color: #f0f0f0; color: #999;' : 'color: #333;';

                        html += `
                            <div class="param-box" style="margin-bottom: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                    <label style="margin:0; font-weight:600;">${key}</label>
                                    <label style="font-size:10px; font-weight:normal; cursor:pointer;">
                                        <input type="checkbox" class="param-include-check" data-key="${key}" ${checkedAttr} ${checkboxDisabled}> Include
                                    </label>
                                </div>
                                ${description ? `<div style="font-size:11px; color:#666; margin-bottom:4px;">${description}</div>` : ''}
                                <input type="text" class="param-input" data-key="${key}" value="${displayValue}" placeholder="${placeholder}" ${disabledAttr} style="width:100%; ${inputStyle}">
                            </div>
                        `;
                    });
                } else {
                    // Fallback for old style string (should not happen with new normalize)
                     html += `
                        <textarea id="prop-step-with" rows="5" placeholder="key: value">${item.with}</textarea>
                    `;
                }
                html += `</div>`;
            }

        }

        propertiesForm.innerHTML = html;
        bindPropertyEvents(type, item);
    }

    function parseKeyValueLines(text) {
        const result = {};
        if (!text) return result;
        const lines = text.split('\n');
        lines.forEach(line => {
            if (!line.trim()) return;
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join(':').trim();
                if (key) {
                    result[key] = value;
                }
            }
        });
        return result;
    }

    function bindPropertyEvents(type, item) {
        if (type === 'workflow') {
            const envList = document.getElementById('env-list');
            const addEnvBtn = document.getElementById('add-env-btn');

            function renderEnvVars() {
                envList.innerHTML = '';
                Object.keys(workflowData.env).forEach(key => {
                    const row = document.createElement('div');
                    row.className = 'param-box';
                    row.style = 'margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:4px; display:flex; gap:5px; align-items:center;';

                    row.innerHTML = `
                        <input type="text" class="env-key" value="${key}" placeholder="KEY" style="flex:1;">
                        <input type="text" class="env-value" value="${workflowData.env[key]}" placeholder="VALUE" style="flex:1;">
                        <button class="remove-env-btn" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
                    `;

                    const keyInput = row.querySelector('.env-key');
                    const valueInput = row.querySelector('.env-value');
                    const removeBtn = row.querySelector('.remove-env-btn');

                    keyInput.addEventListener('change', (e) => {
                        const newKey = e.target.value.trim();
                        if (newKey && newKey !== key) {
                            // Rename
                            const val = workflowData.env[key];
                            delete workflowData.env[key];
                            workflowData.env[newKey] = val;
                            renderEnvVars();
                        }
                    });

                    valueInput.addEventListener('input', (e) => {
                        workflowData.env[key] = e.target.value;
                    });

                    removeBtn.addEventListener('click', () => {
                        delete workflowData.env[key];
                        renderEnvVars();
                    });

                    envList.appendChild(row);
                });
            }

            addEnvBtn.addEventListener('click', () => {
                const newKey = 'VAR_' + Date.now();
                workflowData.env[newKey] = '';
                renderEnvVars();
            });

            renderEnvVars();

        } else if (type === 'trigger') {
            const branchesInput = document.getElementById('prop-trigger-branches');
            if (branchesInput) {
                branchesInput.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (!workflowData.on[item]) workflowData.on[item] = {};

                    if (val) {
                        workflowData.on[item].branches = val.split(',').map(s => s.trim()).filter(s => s);
                    } else {
                        delete workflowData.on[item].branches;
                    }
                });
            }

            const cronInput = document.getElementById('prop-trigger-cron');
            if (cronInput) {
                cronInput.addEventListener('input', (e) => {
                    const val = e.target.value;
                    if (!workflowData.on[item]) workflowData.on[item] = {};
                    workflowData.on[item].cron = val;
                });
            }

            if (item === 'pull_request') {
                const btn = document.getElementById('types-dropdown-btn');
                const content = document.getElementById('types-dropdown-content');
                const textSpan = document.getElementById('types-selected-text');

                if (btn && content) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Toggle
                        if (content.style.display === 'none') {
                            content.style.display = 'block';
                        } else {
                            content.style.display = 'none';
                        }
                    });
                }

                const typeChecks = propertiesForm.querySelectorAll('.trigger-type-check');
                typeChecks.forEach(check => {
                    check.addEventListener('change', (e) => {
                        const val = e.target.value;
                        if (!workflowData.on[item].types) workflowData.on[item].types = [];

                        if (e.target.checked) {
                            if (!workflowData.on[item].types.includes(val)) {
                                workflowData.on[item].types.push(val);
                            }
                        } else {
                            workflowData.on[item].types = workflowData.on[item].types.filter(t => t !== val);
                        }

                        // Update text
                        const selected = workflowData.on[item].types;
                        textSpan.textContent = selected.length > 0 ? selected.join(', ') : 'Select Types...';
                    });
                });
            }

            if (item === 'workflow_dispatch') {
                const inputsContainer = document.getElementById('inputs-list');
                const addInputBtn = document.getElementById('add-input-btn');

                function renderInputs() {
                    inputsContainer.innerHTML = '';
                    const inputs = workflowData.on[item].inputs || {};

                    Object.keys(inputs).forEach(key => {
                        const inputData = inputs[key];
                        // Defaults if not present
                        inputData.type = inputData.type || 'string';
                        inputData.required = inputData.required !== undefined ? inputData.required : false;
                        inputData.default = inputData.default || '';
                        inputData.options = inputData.options || [];

                        const row = document.createElement('div');
                        row.className = 'param-box';
                        row.style = 'margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:4px;';

                        // Header: Name and Delete
                        let html = `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                                <input type="text" class="input-key" placeholder="Name" value="${key}" style="flex:1; margin-right:5px; font-weight:bold;">
                                <button class="remove-input-btn" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
                            </div>
                            <div style="margin-bottom:5px;">
                                <textarea class="input-desc" placeholder="Description" rows="2" style="width:100%; font-size:12px;">${inputData.description || ''}</textarea>
                            </div>
                            <div style="display:flex; gap:10px; margin-bottom:5px;">
                                <select class="input-type" style="flex:1;">
                                    <option value="string" ${inputData.type === 'string' ? 'selected' : ''}>String</option>
                                    <option value="choice" ${inputData.type === 'choice' ? 'selected' : ''}>Choice</option>
                                    <option value="boolean" ${inputData.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                                </select>
                                <select class="input-required" style="flex:1;">
                                    <option value="true" ${inputData.required === true ? 'selected' : ''}>Required: True</option>
                                    <option value="false" ${inputData.required === false ? 'selected' : ''}>Required: False</option>
                                </select>
                            </div>
                        `;

                        // Choice Options
                        const optionsDisplay = inputData.type === 'choice' ? 'block' : 'none';
                        const optsStr = Array.isArray(inputData.options) ? inputData.options.join(', ') : '';

                        html += `
                            <div class="options-container" style="display:${optionsDisplay}; margin-bottom:5px;">
                                <label style="font-size:10px; color:#666;">variables (comma separated)</label>
                                <textarea class="input-options" rows="2" style="width:100%;">${optsStr}</textarea>
                            </div>
                            <div>
                                <label style="font-size:10px; color:#666;">Default Value</label>
                                <input type="text" class="input-default" value="${inputData.default}" style="width:100%;">
                            </div>
                        `;

                        row.innerHTML = html;

                        const keyInput = row.querySelector('.input-key');
                        const descInput = row.querySelector('.input-desc');
                        const typeSelect = row.querySelector('.input-type');
                        const reqSelect = row.querySelector('.input-required');
                        const defaultInput = row.querySelector('.input-default');
                        const optionsInput = row.querySelector('.input-options');
                        const optionsContainer = row.querySelector('.options-container');
                        const rmBtn = row.querySelector('.remove-input-btn');

                        keyInput.addEventListener('change', (e) => {
                            const newKey = e.target.value.trim();
                            if (newKey && newKey !== key) {
                                // Rename
                                const data = workflowData.on[item].inputs[key];
                                delete workflowData.on[item].inputs[key];
                                workflowData.on[item].inputs[newKey] = data;
                                renderInputs();
                            }
                        });

                        descInput.addEventListener('input', (e) => {
                             workflowData.on[item].inputs[key].description = e.target.value;
                        });

                        typeSelect.addEventListener('change', (e) => {
                            const val = e.target.value;
                            workflowData.on[item].inputs[key].type = val;
                            if (val === 'choice') {
                                optionsContainer.style.display = 'block';
                            } else {
                                optionsContainer.style.display = 'none';
                            }
                        });

                        reqSelect.addEventListener('change', (e) => {
                            workflowData.on[item].inputs[key].required = e.target.value === 'true';
                        });

                        defaultInput.addEventListener('input', (e) => {
                            workflowData.on[item].inputs[key].default = e.target.value;
                        });

                        optionsInput.addEventListener('input', (e) => {
                            const val = e.target.value;
                            const opts = val.split(',').map(s => s.trim()).filter(s => s);
                            workflowData.on[item].inputs[key].options = opts;
                            // If options change and default not set, set default to first option?
                            if (opts.length > 0 && !workflowData.on[item].inputs[key].default) {
                                workflowData.on[item].inputs[key].default = opts[0];
                                defaultInput.value = opts[0];
                            }
                        });

                        rmBtn.addEventListener('click', () => {
                            delete workflowData.on[item].inputs[key];
                            renderInputs();
                        });

                        inputsContainer.appendChild(row);
                    });
                }

                addInputBtn.addEventListener('click', () => {
                    if (!workflowData.on[item].inputs) workflowData.on[item].inputs = {};
                    const newKey = 'arg_' + Date.now();
                    workflowData.on[item].inputs[newKey] = {
                        description: 'input description',
                        required: false,
                        default: '',
                        type: 'string'
                    };
                    renderInputs();
                });

                renderInputs();
            }

        } else if (type === 'job') {
            document.getElementById('prop-job-name').addEventListener('input', (e) => {
                item.name = e.target.value;
                renderJobs();
                const el = document.getElementById(item.id);
                if (el) el.classList.add('selected');
            });
            document.getElementById('prop-job-needs').addEventListener('input', (e) => {
                item.needs = e.target.value;
            });
            document.getElementById('prop-job-runs-on').addEventListener('input', (e) => {
                item.runsOn = e.target.value;
                renderJobs();
                const el = document.getElementById(item.id);
                if (el) el.classList.add('selected');
            });
            document.getElementById('prop-job-if').addEventListener('input', (e) => {
                item.if = e.target.value;
            });
        } else if (type === 'step') {
            document.getElementById('prop-step-name').addEventListener('input', (e) => {
                item.name = e.target.value;
                renderJobs();
            });
            document.getElementById('prop-step-if').addEventListener('input', (e) => {
                item.if = e.target.value;
            });

            const commentInput = document.getElementById('prop-step-comment');
            if (commentInput) {
                commentInput.addEventListener('input', (e) => {
                    item._comment = e.target.value;
                });
            }

            const runInput = document.getElementById('prop-step-run');
            if (runInput) {
                runInput.addEventListener('input', (e) => {
                    item.run = e.target.value;
                    renderJobs();
                });
            }

            const shellInput = document.getElementById('prop-step-shell');
            if (shellInput) {
                shellInput.addEventListener('change', (e) => {
                    if (e.target.value) {
                        item.shell = e.target.value;
                    } else {
                        delete item.shell;
                    }
                    renderJobs();
                });
            }

            const usesInput = document.getElementById('prop-step-uses');
            if (usesInput) {
                usesInput.addEventListener('input', (e) => {
                    item.uses = e.target.value;
                    renderJobs();
                });
            }

            // New handler for 'with' parameters
            const paramContainer = propertiesForm.querySelector('.form-group .param-box');
            if (paramContainer) {
                 const checks = propertiesForm.querySelectorAll('.param-include-check');
                 checks.forEach(check => {
                     check.addEventListener('change', (e) => {
                         const key = e.target.dataset.key;
                         const input = propertiesForm.querySelector(`.param-input[data-key="${key}"]`);

                         // Update stored selection state
                         if (!item._selected_params) item._selected_params = {};
                         item._selected_params[key] = e.target.checked;

                         if (e.target.checked) {
                             input.disabled = false;
                             input.style.backgroundColor = '';
                             input.style.color = '#333';
                         } else {
                             input.disabled = true;
                             input.style.backgroundColor = '#f0f0f0';
                             input.style.color = '#999';
                         }
                     });
                 });

                 const inputs = propertiesForm.querySelectorAll('.param-input');
                 inputs.forEach(input => {
                     input.addEventListener('input', (e) => {
                         const key = e.target.dataset.key;
                         if (item.with[key] && typeof item.with[key] === 'object') {
                             item.with[key].value = e.target.value;
                         } else {
                             item.with[key] = { value: e.target.value, description: '' };
                         }
                     });
                 });
            } else {
                // Fallback for old textarea
                const withInput = document.getElementById('prop-step-with');
                if (withInput) {
                    withInput.addEventListener('input', (e) => {
                        const parsed = parseKeyValueLines(e.target.value);
                        if (Object.keys(parsed).length > 0) {
                            item.with = parsed;
                        } else {
                            delete item.with;
                        }
                    });
                }
            }

        }
    }

    function buildExportObject() {
        // Construct the payload expected by backend or for save
        workflowData.name = workflowNameInput.value;

        const finalOn = {};
        const triggerKeys = Object.keys(workflowData.on);

        if (triggerKeys.length === 0) {
            finalOn.workflow_dispatch = {};
        } else {
            triggerKeys.forEach(key => {
                const config = workflowData.on[key];

                // Copy to finalOn
                finalOn[key] = {};

                if (config.branches) {
                    finalOn[key].branches = config.branches;
                }

                if (key === 'pull_request' && config.types && config.types.length > 0) {
                    finalOn[key].types = config.types;
                }

                if (key === 'workflow_dispatch' && config.inputs) {
                    finalOn[key].inputs = {};
                    Object.keys(config.inputs).forEach(inputKey => {
                        const inputData = config.inputs[inputKey];
                        const inputObj = {
                            description: inputData.description || '',
                            required: inputData.required,
                            default: inputData.default
                        };

                        if (inputData.type !== 'string') {
                            inputObj.type = inputData.type;
                        }

                        if (inputData.type === 'choice' && inputData.options) {
                            inputObj.options = inputData.options;
                        }

                        finalOn[key].inputs[inputKey] = inputObj;
                    });
                }

                if (key === 'schedule' && config.cron) {
                    finalOn[key] = [
                        { cron: config.cron }
                    ];
                }
            });
        }

        const finalWorkflow = {
            name: workflowData.name,
            on: Object.keys(finalOn).length > 0 ? finalOn : 'workflow_dispatch',
            jobs: {}
        };

        if (Object.keys(workflowData.env).length > 0) {
            finalWorkflow.env = workflowData.env;
        }

        workflowData.jobs.forEach(job => {
            const jobObj = {
                'runs-on': job.runsOn,
                steps: job.steps.map(step => {
                    const s = {};
                    if (step._comment) s._comment = step._comment;
                    if (step.name) s.name = step.name;
                    if (step.if) s.if = step.if;
                    if (step.uses) s.uses = step.uses;
                    if (step.run) s.run = step.run;

                    // Flatten 'with'
                    if (step.with) {
                        if (typeof step.with === 'object') {
                             const flattenedWith = {};

                             let configStep = null;
                             if (window.stepsConfig && step._configSubtype) {
                                const sc = window.stepsConfig.find(sc => sc.subtype === step._configSubtype);
                                if (sc && sc.steps && sc.steps[step._configStepIndex] !== undefined) {
                                    configStep = sc.steps[step._configStepIndex];
                                }
                             }

                             Object.keys(step.with).forEach(k => {
                                 let isSelected = true;
                                 if (step._selected_params && step._selected_params[k] !== undefined) {
                                     isSelected = step._selected_params[k];
                                 } else {
                                     if (configStep && configStep.with && configStep.with[k] && configStep.with[k].selected === false) {
                                         isSelected = false;
                                     }
                                     if (configStep && configStep.with && configStep.with[k] && configStep.with[k].mandatory === true) {
                                         isSelected = true;
                                     }
                                 }

                                 if (!isSelected) return;

                                 let val = step.with[k];
                                 let finalVal = '';

                                 if (typeof val === 'object' && val !== null) {
                                     finalVal = val.value || '';
                                 } else {
                                     finalVal = val;
                                 }

                                 if (finalVal === '' && configStep && configStep.with && configStep.with[k]) {
                                     const configVal = configStep.with[k];
                                     if (typeof configVal === 'object') {
                                         finalVal = configVal.value || '';
                                     } else {
                                         finalVal = configVal;
                                     }
                                 }

                                 if (finalVal !== '') {
                                     flattenedWith[k] = finalVal;
                                 }
                             });
                             if (Object.keys(flattenedWith).length > 0) {
                                 s.with = flattenedWith;
                             }
                        } else {
                            s.with = step.with;
                        }
                    }

                    if (step.shell) s.shell = step.shell;
                    if (step.secrets) s.secrets = step.secrets;
                    return s;
                })
            };

            if (job.needs) {
                if (job.needs.includes(',')) {
                    jobObj.needs = job.needs.split(',').map(n => n.trim()).filter(n => n);
                } else {
                    jobObj.needs = job.needs.trim();
                }
            }

            if (job.if) {
                jobObj.if = job.if;
            }

            finalWorkflow.jobs[job.name] = jobObj;
        });
        return finalWorkflow;
    }

    // Generate YAML
    generateBtn.addEventListener('click', () => {
        const finalWorkflow = buildExportObject();

        fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalWorkflow)
        })
        .then(response => response.json())
        .then(data => {
            yamlOutput.value = data.yaml;
            downloadBtn.style.display = 'inline-block';
        })
        .catch(err => console.error(err));
    });

    // Save Work Logic
    if (saveWorkBtn) {
        saveWorkBtn.addEventListener('click', () => {
            const dataToSave = {
                name: workflowNameInput.value,
                data: buildExportObject() // Save the internal structure or the export object? 
                                        // The export object is cleaner but we might lose some UI state (e.g. collapsed sections?)
                                        // Actually buildExportObject creates a structure compatible with importWorkflow mostly.
                                        // But importWorkflow expects `data.jobs` to be object or array?
                                        // Let's check importWorkflow.
                                        // importWorkflow handles both.
                                        // But wait, buildExportObject produces `jobs` as an object { jobName: jobData }.
                                        // importWorkflow expects `data.jobs` to be object (jobId -> content) or array (if we changed it).
                                        // importWorkflow: if (data.jobs) { Object.keys(data.jobs).forEach... }
                                        // This works for object.
                                        // However, `buildExportObject` constructs the final YAML-ready structure.
                                        // `importWorkflow` is designed to import that structure.
                                        // So using `buildExportObject()` is fine.
            };

            fetch('/save_session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            })
            .then(r => r.json())
            .then(data => {
                if(data.error) {
                    alert('Error saving: ' + data.error);
                } else {
                    alert('Work saved successfully!');
                }
            })
            .catch(err => alert('Error saving: ' + err));
        });
    }

    // Resume Work Logic
    const resumeModal = document.getElementById('resume-work-modal');
    const resumeList = document.getElementById('resume-list');
    const startNewBtn = document.getElementById('start-new-btn');

    if (resumeModal && resumeList) {
        // Fetch recent sessions
        fetch('/get_recent_sessions')
        .then(r => {
            if (r.status === 401) return []; // Not logged in
            return r.json();
        })
        .then(sessions => {
            if (sessions && sessions.length > 0) {
                resumeList.innerHTML = '';
                sessions.forEach(session => {
                    const row = document.createElement('div');
                    row.style = "padding: 10px; border: 1px solid #eee; border-radius: 4px; margin-bottom: 5px; cursor: pointer; background: #fff;";
                    row.onmouseover = () => row.style.background = '#f6f8fa';
                    row.onmouseout = () => row.style.background = '#fff';
                    
                    const date = new Date(session.timestamp).toLocaleString();
                    row.innerHTML = `<strong>${session.name || 'Untitled'}</strong> <span style="font-size: 12px; color: #666;">(${date})</span>`;
                    
                    row.onclick = () => {
                        loadSession(session.id);
                    };
                    resumeList.appendChild(row);
                });
                resumeModal.style.display = 'block';
            }
        })
        .catch(err => console.error("Error fetching sessions", err));

        startNewBtn.addEventListener('click', () => {
            resumeModal.style.display = 'none';
        });
    }

    function loadSession(sessionId) {
        fetch('/load_session/' + sessionId)
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            if (data.data) {
                // If data.data is string (json string), parse it. 
                // But backend returns it as object in `to_dict`?
                // `json.loads(self.data)` in backend `to_dict`. So it is object.
                // However, the `data` field in the response contains the workflow object.
                // Wait, `save_session` stores `request.json.data`.
                // `buildExportObject` returns the workflow object.
                // So `data.data` is the workflow object.
                importWorkflow(data.data);
                resumeModal.style.display = 'none';
                
                // Switch to editor tab
                document.querySelector('.tab-btn[data-tab="tab-editor"]').click();
            }
        })
        .catch(err => alert('Error loading session: ' + err));
    }

    // Save Template (Download)
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener('click', async () => {
             // Prepare data
             const finalWorkflow = buildExportObject();
             let filename = (workflowData.name.replace(/[^a-zA-Z0-9-_]/g, '-') || 'workflow') + '.yml';

             // Try File System Access API first (must be triggered immediately by user gesture)
             if (window.showSaveFilePicker) {
                 try {
                     const handle = await window.showSaveFilePicker({
                         suggestedName: filename,
                         types: [{
                             description: 'YAML File',
                             accept: {'text/yaml': ['.yml', '.yaml']},
                         }],
                     });

                     // If we got here, user selected a file. Now generate content.
                     const response = await fetch('/generate', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify(finalWorkflow)
                     });
                     const data = await response.json();
                     const yamlContent = data.yaml;

                     const writable = await handle.createWritable();
                     await writable.write(yamlContent);
                     await writable.close();
                     return;
                 } catch (e) {
                     // If user cancelled, stop.
                     if (e.name === 'AbortError') {
                         return;
                     }
                     console.warn("File System Access API failed, falling back to download", e);
                     // If other error, proceed to fallback
                 }
             }

             // Fallback: Generate then Download
             try {
                 const response = await fetch('/generate', {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json'
                     },
                     body: JSON.stringify(finalWorkflow)
                 });
                 const data = await response.json();
                 const yamlContent = data.yaml;

                 const blob = new Blob([yamlContent], { type: 'text/yaml' });
                 const url = URL.createObjectURL(blob);
                 const a = document.createElement('a');
                 a.href = url;
                 a.download = filename;
                 document.body.appendChild(a);
                 a.click();
                 document.body.removeChild(a);
                 URL.revokeObjectURL(url);
             } catch (err) {
                 console.error(err);
             }
        });
    }

    // Contact Modal Logic
    const contactBtn = document.getElementById('contact-btn');
    const contactModal = document.getElementById('contact-modal');
    const closeModal = document.querySelector('.close-modal');

    if (contactBtn && contactModal) {
        contactBtn.addEventListener('click', () => {
            contactModal.style.display = "block";
        });
    }

    if (closeModal && contactModal) {
        closeModal.addEventListener('click', () => {
            contactModal.style.display = "none";
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === contactModal) {
            contactModal.style.display = "none";
        }

        // Close dropdowns if clicking outside
        const dropdowns = document.querySelectorAll('.multiselect-dropdown');
        dropdowns.forEach(dd => {
            const btn = dd.querySelector('#types-dropdown-btn'); // Using ID search within element might be risky if duplicated, but here we only have one at a time
            const content = dd.querySelector('#types-dropdown-content');
            if (btn && content && content.style.display !== 'none') {
                if (!dd.contains(event.target)) {
                    content.style.display = 'none';
                }
            }
        });
    });

    // Download YAML
    downloadBtn.addEventListener('click', () => {
        const yamlContent = yamlOutput.value;
        if (!yamlContent) return;

        const blob = new Blob([yamlContent], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workflow.yml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});
