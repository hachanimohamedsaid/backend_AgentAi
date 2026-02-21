import {
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Analysis, AnalysisDocument } from './schemas/analysis.schema';

const TIMEOUT_MS = 90000;

@Injectable()
export class AdvisorService {
  constructor(
    @InjectModel(Analysis.name) private analysisModel: Model<AnalysisDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendProjectToAdvisor(text: string): Promise<{ report: string }> {
    const url =
      this.configService.get<string>('ADVISOR_N8N_WEBHOOK_URL') ||
      'https://n8n-production-1e13.up.railway.app/webhook/a0cd36ce-41f1-4ef8-8bb2-b22cbe7cad6c';
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          { text: text.trim() },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: TIMEOUT_MS,
          },
        ),
      );
      const report = response.data?.report;
      if (report == null || typeof report !== 'string') {
        throw new Error('Invalid n8n response: missing or invalid report');
      }
      return { report };
    } catch (err: any) {
      if (err.code === 'ECONNABORTED') {
        throw new HttpException(
          'Request timeout. Please try again.',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      const status = err.response?.status;
      const message =
        status >= 500
          ? 'Server error. Try again later.'
          : err.message || 'Analysis failed';
      throw new HttpException(
        message,
        status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async analyze(
    projectText: string,
    userId?: string,
  ): Promise<{ report: string }> {
    const { report } = await this.sendProjectToAdvisor(projectText);

    await this.analysisModel.create({
      userId: userId || undefined,
      project_text: projectText.trim(),
      report,
    });

    return { report };
  }

  async getHistory(
    userId?: string,
  ): Promise<
    { id: string; project_text: string; report: string; createdAt: Date }[]
  > {
    const filter = userId ? { userId } : {};
    const docs = await this.analysisModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select('project_text report createdAt')
      .lean()
      .exec();

    return docs.map((d: any) => ({
      id: d._id.toString(),
      project_text: d.project_text ?? '',
      report: d.report ?? '',
      createdAt: d.createdAt,
    }));
  }
}
