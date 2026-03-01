import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContextDocument = Context & Document;

export type ContextLocation = 'home' | 'work' | 'outside';
export type ContextWeather = 'sunny' | 'cloudy' | 'rain';

@Schema({ _id: false })
export class Meeting {
  @Prop({ required: true })
  title: string;

  /** Time in HH:mm format */
  @Prop({ required: true })
  time: string;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

@Schema({ collection: 'assistant_contexts', timestamps: true })
export class Context {
  @Prop({ required: true, index: true })
  userId: string;

  /** Time in HH:mm format */
  @Prop({ required: true })
  time: string;

  @Prop({ required: true, enum: ['home', 'work', 'outside'] })
  location: ContextLocation;

  @Prop({ required: true, enum: ['sunny', 'cloudy', 'rain'] })
  weather: ContextWeather;

  @Prop({ type: [MeetingSchema], default: [] })
  meetings: Meeting[];

  @Prop({ required: true })
  focusHours: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ContextSchema = SchemaFactory.createForClass(Context);
