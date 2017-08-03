import { ModulVue } from '../../utils/vue/vue';
import { PluginObject } from 'vue';
import Component from 'vue-class-component';
import { Prop } from 'vue-property-decorator';
import WithRender from './timepicker.html?style=./timepicker.scss';
import { TIMEPICKER_NAME } from '../component-names';
import * as moment from 'moment';
import { curLang } from '../../utils/i18n/i18n';

export interface TimepickerObject {
    hour: number;
    minute: number;
}

@WithRender
@Component
export class MTimepicker extends ModulVue {

    @Prop()
    public hour: number;
    @Prop()
    public minute: number;
    @Prop({ default: 'LT' })
    public format: string;

    private selectedHour: number = 0;
    private selectedMinute: number = 0;
    private tempHour: number = 0;
    private tempMinute: number = 0;
    private placeholder: string = this.$i18n.translate('m-timepicker:placeholder');
    private openTimeSelectorDesc: string = this.$i18n.translate('m-timepicker:desc-open-time-selector');
    private closeTimeSelectorDesc: string = this.$i18n.translate('m-timepicker:desc-close-time-selector');
    private okButtonText: string = this.$i18n.translate('m-timepicker:button-ok');
    private error: string = '';
    private isOpen: boolean = false;
    private isMousedown: boolean = false;
    private scrollTimeout;

    private mounted(): void {
        moment.locale(curLang);
        this.tempHour = this.selectedHour = this.hour || moment().hour();
        this.tempMinute = this.selectedMinute = this.minute || moment().minute();
    }

    private get formattedTime(): string {
        return moment().hour(this.selectedHour).minute(this.selectedMinute).format(this.format);
    }

    private onChange(event, value: string): void {
        let numbers = value.match(/\d+/g);
        if (numbers && numbers.length == 2 && Number(numbers[0]) >= 0 && Number(numbers[0]) < 24 && Number(numbers[1]) >= 0 && Number(numbers[1]) < 60) {
            this.selectedHour = parseInt(numbers[0], 10);
            this.selectedMinute = parseInt(numbers[1], 10);
            this.error = '';
            this.$emit('change', { hour: this.selectedHour, minute: this.selectedMinute });
        } else {
            this.error = this.$i18n.translate('m-timepicker:error-format');
        }
        this.$children[0]['closePopper']();
    }

    private onShow(): void {
        this.scrollToSelection(this.$refs['hours'] as HTMLElement);
        this.scrollToSelection(this.$refs['minutes'] as HTMLElement);
        this.isOpen = true;
        this.$emit('show');
    }

    private onHide(): void {
        this.tempHour = this.selectedHour;
        this.tempMinute = this.selectedMinute;
        this.isOpen = false;
        this.$emit('hide');
    }

    private scrollToSelection(container: HTMLElement): void {
        let selectedElement = container.querySelector('.m--is-selected');
        setTimeout(function() {
            if (selectedElement) {
                container.scrollTop = selectedElement['offsetTop'] - container.clientHeight / 2 + selectedElement.clientHeight / 2;
            }
        }, 10);
    }

    private onScroll(event: Event): void {
        if (!this.isMousedown) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                if (event.srcElement) this.positionScroll(event.srcElement);
            }, 300);
        }
    }

    private onMousedown(event: Event): void {
        this.isMousedown = true;
    }

    private onMouseup(event: Event): void {
        this.isMousedown = false;
        if (event.srcElement) this.positionScroll(event.srcElement);
    }

    private positionScroll(el: Element) {
        el.scrollTop = Math.round(el.scrollTop / 36) * 36;
    }

    private selectHour(hour: number): void {
        this.tempHour = hour;
    }

    private selectMinute(minute: number): void {
        this.tempMinute = minute;
    }

    private onOk(): void {
        this.selectedHour = this.tempHour;
        this.selectedMinute = this.tempMinute;
        this.$emit('change', { hour: this.selectedHour, minute: this.selectedMinute });
        this.$children[0]['closePopper']();
    }
}

const TimepickerPlugin: PluginObject<any> = {
    install(v, options) {
        v.component(TIMEPICKER_NAME, MTimepicker);
    }
};

export default TimepickerPlugin;
