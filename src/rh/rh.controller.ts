import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RhService } from './rh.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Controller('rh')
@UseGuards(JwtAuthGuard)
export class RhController {
  constructor(private readonly rhService: RhService) {}

  @Get('employees')
  getEmployees() {
    return this.rhService.findAll();
  }

  @Post('employees')
  addEmployee(@Body() body: CreateEmployeeDto) {
    return this.rhService.create(body);
  }

  @Put('employees/:id')
  updateEmployee(@Param('id') id: string, @Body() body: UpdateEmployeeDto) {
    return this.rhService.update(id, body);
  }

  @Delete('employees/:id')
  deleteEmployee(@Param('id') id: string) {
    return this.rhService.remove(id);
  }
}
