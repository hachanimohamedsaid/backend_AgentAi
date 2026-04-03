import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Employee, EmployeeDocument } from './schemas/employee.schema';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  @Get()
  async list() {
    return this.employeeModel.find().sort({ fullName: 1 }).exec();
  }
}
