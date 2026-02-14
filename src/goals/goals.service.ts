import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Goal, GoalDocument } from './schemas/goal.schema';
import { Achievement, AchievementDocument } from './schemas/achievement.schema';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Achievement.name)
    private achievementModel: Model<AchievementDocument>,
  ) {}

  private toGoalResponse(doc: GoalDocument) {
    const obj = doc.toJSON ? doc.toJSON() : (doc as any);
    return {
      id: obj.id ?? (doc as any)._id?.toString(),
      title: doc.title,
      category: doc.category,
      progress: doc.progress ?? 0,
      deadline: doc.deadline ?? 'Ongoing',
      streak: doc.streak ?? 0,
      dailyActions: (doc.dailyActions ?? []).map((a: any) => ({
        id: a.id,
        label: a.label,
        completed: a.completed ?? false,
      })),
    };
  }

  async findAll(userId: string) {
    const goals = await this.goalModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .exec();
    return goals.map((g) => this.toGoalResponse(g));
  }

  async findAchievements(userId: string) {
    const achievements = await this.achievementModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return achievements.map((a) => {
      const obj = a.toJSON ? a.toJSON() : (a as any);
      return {
        id: obj.id ?? (a as any)._id?.toString(),
        icon: a.icon,
        title: a.title,
        date: a.date,
      };
    });
  }

  async create(userId: string, dto: CreateGoalDto) {
    const title = (dto.title ?? '').trim() || 'New goal';
    const category = dto.category?.trim() || 'Personal';
    const dailyActions = (dto.dailyActions ?? []).map((a, i) => ({
      id: a.id?.trim() || `action_${Date.now()}_${i}`,
      label: (a.label ?? '').trim() || `Action ${i + 1}`,
      completed: a.completed ?? false,
    }));
    const doc = new this.goalModel({
      userId,
      title,
      category,
      deadline: dto.deadline?.trim() || 'Ongoing',
      progress: 0,
      streak: 0,
      dailyActions,
    });
    const saved = await doc.save();
    return this.toGoalResponse(saved);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    const goal = await this.goalModel
      .findOne({ _id: id, userId })
      .exec();
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }
    if (dto.title !== undefined) (goal as any).title = dto.title;
    if (dto.category !== undefined) (goal as any).category = dto.category;
    if (dto.progress !== undefined) (goal as any).progress = dto.progress;
    if (dto.deadline !== undefined) (goal as any).deadline = dto.deadline;
    if (dto.streak !== undefined) (goal as any).streak = dto.streak;
    await goal.save();
    return this.toGoalResponse(goal);
  }

  async toggleAction(
    userId: string,
    goalId: string,
    actionId: string,
    completed: boolean,
  ) {
    const goal = await this.goalModel
      .findOne({ _id: goalId, userId })
      .exec();
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }
    const actions = (goal as any).dailyActions ?? [];
    const index = actions.findIndex((a: any) => a.id === actionId);
    if (index === -1) {
      throw new NotFoundException('Action not found');
    }
    actions[index].completed = completed;
    (goal as any).dailyActions = actions;
    await goal.save();
    return this.toGoalResponse(goal);
  }
}
