import { Controller, Get } from '@nestjs/common';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('internal/all')
  async getAllEmployeesInternal() {
    return this.employeesService.findAll();
  }
}

