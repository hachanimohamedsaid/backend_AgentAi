import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from '../pm/schemas/project.schema';
import { Sprint, SprintDocument } from '../pm/schemas/sprint.schema';
import { Task, TaskDocument } from '../pm/schemas/task.schema';
import { Employee, EmployeeDocument } from '../pm/schemas/employee.schema';
import { DispatchSprintEmailsService } from '../project-dispatch/dispatch-sprint-emails.service';

@Injectable()
export class InternalService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Sprint.name) private sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Employee.name) private employeeModel: Model<EmployeeDocument>,
    private readonly dispatchService: DispatchSprintEmailsService,
  ) {}

  async getAcceptedProjects() {
    const projects = await this.projectModel
      .find({
        $or: [{ status: /^accepted$/i }, { status: /^accept$/i }],
      })
      .sort({ updatedAt: -1 })
      .exec();
    return projects;
  }

  async getAllProjects() {
    return this.projectModel.find().sort({ updatedAt: -1 }).exec();
  }

  async getProjectTasks(rowNumber: number) {
    const project = await this.projectModel
      .findOne({ row_number: rowNumber }).exec();
    if (!project) return [];
    const sprints = await this.sprintModel
      .find({ projectId: String(project._id) }).exec();
    const sprintIds = sprints.map(s => String(s._id));
    const tasks = await this.taskModel
      .find({ sprintId: { $in: sprintIds } }).exec();
    return Promise.all(tasks.map(async t => {
      const sprint = sprints.find(
        s => String(s._id) === String(t.sprintId)
      );
      let assignedEmployee: EmployeeDocument | null = null;
      if (t.assignedEmployeeId) {
        assignedEmployee = await this.employeeModel
          .findById(t.assignedEmployeeId).exec();
      }
      return {
        id: String(t._id),
        title: t.title,
        description: t.description,
        requiredProfile: t.requiredProfile,
        assignedEmployeeId: t.assignedEmployeeId
          ? String(t.assignedEmployeeId) : null,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        status: t.status,
        deliverable: t.deliverable,
        sprintId: String(t.sprintId),
        sprintTitle: sprint?.title ?? '',
        assignedEmployee: assignedEmployee ? {
          fullName: assignedEmployee.fullName,
          email: assignedEmployee.email
        } : null
      };
    }));
  }

  async getTask(id: string) {
    const t = await this.taskModel.findById(id).exec();
    if (!t) return null;
    return {
      id: String(t._id),
      title: t.title,
      description: t.description,
      requiredProfile: t.requiredProfile,
      assignedEmployeeId: t.assignedEmployeeId
        ? String(t.assignedEmployeeId) : null,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      status: t.status,
      deliverable: t.deliverable,
      sprintId: String(t.sprintId),
    };
  }

  async getTasksByEmployee(employeeId: string) {
    const tasks = await this.taskModel
      .find({ assignedEmployeeId: employeeId }).exec();
    return Promise.all(tasks.map(async t => {
      const sprint = await this.sprintModel.findById(t.sprintId).exec();
      const project = sprint
        ? await this.projectModel
            .findById((sprint as any).projectId).exec()
        : null;
      return {
        id: String(t._id),
        title: t.title,
        description: t.description,
        requiredProfile: t.requiredProfile,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        status: t.status,
        deliverable: t.deliverable,
        sprintTitle: sprint?.title ?? '',
        projectTitle: project?.title ?? ''
      };
    }));
  }

  async getEmployee(id: string) {
    return this.employeeModel.findById(id).exec();
  }

  async mergeEmployee(oldId: string, newId: string) {
    const result = await this.taskModel
      .updateMany(
        { assignedEmployeeId: oldId },
        { $set: { assignedEmployeeId: newId } },
      )
      .exec();
    return {
      success: true,
      tasksUpdated: result.modifiedCount,
    };
  }

  async assignTask(id: string, employeeId: string) {
    try {
      const task = await this.taskModel.findById(id).exec();
      if (!task) {
        return { success: false, reason: 'task_not_found' };
      }
      if (task.assignedEmployeeId && task.status === 'assigned') {
        return { success: false, reason: 'already_assigned' };
      }
      const updated = await this.taskModel
        .findByIdAndUpdate(
          id,
          {
            $set: {
              assignedEmployeeId: employeeId,
              status: 'assigned',
            },
          },
          { new: true },
        )
        .exec();
      return { success: true, task: updated };
    } catch (err) {
      return {
        success: false,
        reason: 'error',
        error: String(err),
      };
    }
  }

  async debugTask(id: string) {
    try {
      const task = await this.taskModel.findById(id).exec();
      return {
        found: !!task,
        id,
        task: task ? task.toJSON() : null,
      };
    } catch (err) {
      return { found: false, error: String(err) };
    }
  }

  async rejectTask(id: string, employeeId: string) {
    await this.taskModel.findByIdAndUpdate(id, {
      $addToSet: { rejectedBy: employeeId }
    }).exec();
    return { success: true };
  }

  async startTask(id: string) {
    await this.taskModel.findByIdAndUpdate(id, {
      $set: { status: 'in_progress' },
    }).exec();
    return { success: true };
  }

  async resetTask(id: string) {
    await this.taskModel.findByIdAndUpdate(id, {
      $set: { status: 'todo' },
    }).exec();
    return { success: true };
  }

  async completeTask(id: string) {
    await this.taskModel.findByIdAndUpdate(id, {
      $set: { status: 'done' }
    }).exec();
    return { success: true };
  }

  async markTaskDoneAndNotify(taskId: string, employeeId: string) {
    await this.taskModel.findByIdAndUpdate(taskId, {
      $set: { status: 'done' },
    }).exec();

    try {
      const axios = require('axios');
      await axios.post(
        'https://n8n-production-1e13.up.railway.app/webhook/ava-task-complete',
        { taskId, employeeId },
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      console.log(
        'N8N notification failed:',
        e instanceof Error ? e.message : String(e),
      );
    }

    return { success: true };
  }

  async markDispatched(id: string) {
    await this.projectModel.findByIdAndUpdate(id, {
      $set: { trelloDispatchDone: true }
    }).exec();
    return { success: true };
  }

  async resetDispatch(id: string) {
    await this.projectModel.findByIdAndUpdate(id, {
      $set: { trelloDispatchDone: false }
    }).exec();
    return { success: true };
  }

  async dispatchProject(rowNumber: string, body: any) {
    const project = await this.projectModel.findOne({ 
      row_number: parseInt(rowNumber) 
    }).exec();
    if (!project) {
      return { error: 'Project not found', rowNumber };
    }

    const sprints = await this.sprintModel.find({ 
      projectId: String(project._id) 
    }).exec();

    const sprintIds = sprints.map(s => String(s._id));
    const tasks = await this.taskModel.find({ 
      sprintId: { $in: sprintIds } 
    }).exec();

    return {
      projectId: String(project._id),
      rowNumber: project.row_number,
      title: project.title,
      status: project.status,
      sprintsCount: sprints.length,
      tasksCount: tasks.length,
      readyToDispatch: true
    };
  }

  async runDispatch(rowNumber: string, body: any) {
    return this.dispatchService.run(rowNumber, body);
  }
}
